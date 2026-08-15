import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Handoff } from "../handoff/types";
import { authorize } from "../policy/authorize";
import { redactText } from "../policy/redact";
import { DEFAULT_POLICY, type Policy } from "../policy/schema";
import type { Capability, Parameter, Step } from "../schema/capability";
import { RunSession } from "../session/session";
import { LocatorError, type Surface } from "../surface/surface";
import { compileCapability, type RecordedAct } from "./compile";
import type { Decision, Model } from "./decision";
import { clickRisk, roleTarget, tableTarget } from "./targets";

export type DiscoveryLogEvent = {
  type: "acted" | "decided" | "escalated" | "human";
  detail: string;
};

export type DiscoveryResult =
  | {
      status: "success";
      capability: Capability;
      events: DiscoveryLogEvent[];
      log: DiscoveryLog;
    }
  | {
      status: "escalated" | "failed";
      reason: string;
      events: DiscoveryLogEvent[];
      log: DiscoveryLog;
    };

export type DiscoveryLog = {
  goal: string;
  model: string;
  events: DiscoveryLogEvent[];
};

export type DiscoverOptions = {
  goal: string;
  entryPoint: string;
  surface: Surface;
  model: Model;
  params?: Record<string, string>;
  policy?: Policy;
  maxSteps?: number;
  appFamily?: string;
  evidenceDir?: string;
  artifactEntryPoint?: string;
  handoff?: Handoff;
  session?: RunSession;
};

export async function discover(
  options: DiscoverOptions,
): Promise<DiscoveryResult> {
  const params = options.params ?? {};
  const policy = options.policy ?? DEFAULT_POLICY;
  const maxSteps = options.maxSteps ?? 12;
  const appFamily = options.appFamily ?? "core-servicing";
  const session = options.session ?? new RunSession(options.surface);
  const surface = session.surface;
  const events: DiscoveryLogEvent[] = [];
  const acts: RecordedAct[] = [];
  const history: string[] = [];
  const paramFields: Parameter[] = Object.keys(params).map((name) => ({
    name,
    type: "string",
    sensitivity: "identifier",
    description: name,
  }));
  const scrub = (text: string) => redactText(text, params, paramFields);

  const log = (): DiscoveryLog => ({
    goal: options.goal,
    model: options.model.name,
    events,
  });

  const navStep: Step = {
    id: "open-app",
    action: "navigate",
    url: { kind: "entry" },
    risk: "read",
  };
  const denied = authorize(navStep, options.entryPoint, policy);
  if (denied) {
    return {
      status: denied.kind === "escalate" ? "escalated" : "failed",
      reason: denied.reason,
      events,
      log: log(),
    };
  }
  await surface.goto(options.entryPoint);
  acts.push({ action: "navigate" });
  history.push("navigate entry");
  events.push({ type: "acted", detail: "navigate entry" });

  const intervene = async (reason: string, step: Step): Promise<boolean> => {
    events.push({ type: "escalated", detail: reason });
    if (!options.handoff) return false;
    session.cede();
    let screenshotPath: string | undefined;
    if (options.evidenceDir) {
      await mkdir(options.evidenceDir, { recursive: true });
      screenshotPath = join(options.evidenceDir, "discovery-hitl.png");
      await surface.screenshot(screenshotPath);
    }
    const outcome = await options.handoff.intervene(session, {
      capabilityId: "discovery",
      step,
      reason,
      observation: await surface.observe(),
      screenshotPath,
    });
    for (const action of outcome.actions) {
      events.push({ type: "human", detail: action.detail });
    }
    session.resume();
    return outcome.resume !== "abort";
  };

  for (let n = 0; n < maxSteps; n += 1) {
    const observation = await surface.observe();
    const inventory = await surface.inventory();
    const decision = await options.model.decide({
      goal: options.goal,
      observation: {
        ...observation,
        text: scrub(observation.text),
      },
      inventory: inventory.map((control) =>
        control.value ? { ...control, value: scrub(control.value) } : control,
      ),
      history,
      paramNames: Object.keys(params),
      params,
    });
    events.push({
      type: "decided",
      detail: scrub(describeDecision(decision)),
    });

    if (
      decision.type === "fill" &&
      acts.some((act) => act.action === "fill" && act.name === decision.name)
    ) {
      history.push(
        `ignored repeat fill of ${decision.name}; pick a different action`,
      );
      continue;
    }

    if (decision.type === "done") {
      const capability = compileCapability({
        entryPoint: options.artifactEntryPoint ?? options.entryPoint,
        appFamily,
        params,
        acts,
        done: decision,
      });
      if (options.evidenceDir) {
        await mkdir(options.evidenceDir, { recursive: true });
        await surface.screenshot(join(options.evidenceDir, "discovery.png"));
      }
      return { status: "success", capability, events, log: log() };
    }

    if (decision.type === "give_up") {
      const continued = await intervene(decision.reason, navStep);
      if (!continued) {
        return {
          status: "escalated",
          reason: decision.reason,
          events,
          log: log(),
        };
      }
      continue;
    }

    try {
      await act(decision, { surface, policy, params });
    } catch (error) {
      if (error instanceof LocatorError) {
        const continued = await intervene(
          `locator miss: ${error.expected}`,
          navStep,
        );
        if (!continued) {
          return {
            status: "failed",
            reason: scrub(`${error.expected}; ${error.observed}`),
            events,
            log: log(),
          };
        }
        continue;
      }
      if (error instanceof PolicyError) {
        return {
          status: error.kind,
          reason: error.message,
          events,
          log: log(),
        };
      }
      throw error;
    }

    acts.push(toAct(decision));
    history.push(scrub(describeDecision(decision)));
    events.push({
      type: "acted",
      detail: scrub(describeDecision(decision)),
    });
  }

  return {
    status: "escalated",
    reason: `stopped after ${maxSteps} steps`,
    events,
    log: log(),
  };
}

class PolicyError extends Error {
  constructor(
    readonly kind: "escalated" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

async function act(
  decision: Exclude<Decision, { type: "done" } | { type: "give_up" }>,
  ctx: { surface: Surface; policy: Policy; params: Record<string, string> },
) {
  if (decision.type === "fill") {
    const step: Step = {
      id: `fill-${decision.name}`,
      action: "fill",
      target: roleTarget(decision.role, decision.name),
      value: { kind: "literal", value: decision.value },
      risk: "reversible",
    };
    denyOrThrow(authorize(step, undefined, ctx.policy));
    await ctx.surface.fill(step.target, decision.value);
    return;
  }
  if (decision.type === "click") {
    const step: Step = {
      id: `click-${decision.name}`,
      action: "click",
      target: roleTarget(decision.role, decision.name),
      risk: clickRisk(decision.name),
    };
    denyOrThrow(authorize(step, undefined, ctx.policy));
    await ctx.surface.click(step.target);
    return;
  }
  const step: Step = {
    id: `extract-${decision.output}`,
    action: "extract",
    target: tableTarget(decision.rowText, decision.columnHeader),
    output: decision.output,
    risk: "read",
  };
  denyOrThrow(authorize(step, undefined, ctx.policy));
  await ctx.surface.extract(step.target);
}

function denyOrThrow(denial: ReturnType<typeof authorize>): void {
  if (!denial) return;
  throw new PolicyError(
    denial.kind === "escalate" ? "escalated" : "failed",
    denial.reason,
  );
}

function toAct(
  decision: Exclude<Decision, { type: "done" } | { type: "give_up" }>,
): RecordedAct {
  if (decision.type === "fill") {
    return {
      action: "fill",
      role: decision.role,
      name: decision.name,
      value: decision.value,
      param: decision.param,
    };
  }
  if (decision.type === "click") {
    return { action: "click", role: decision.role, name: decision.name };
  }
  return {
    action: "extract",
    rowText: decision.rowText,
    columnHeader: decision.columnHeader,
    output: decision.output,
    outputType: decision.outputType,
  };
}

function describeDecision(decision: Decision): string {
  switch (decision.type) {
    case "fill":
      return decision.param
        ? `fill ${decision.name} from param.${decision.param}`
        : `fill ${decision.name}`;
    case "click":
      return `click ${decision.name}`;
    case "extract":
      return `extract ${decision.output}`;
    case "done":
      return `done: ${decision.reason}`;
    case "give_up":
      return `give_up: ${decision.reason}`;
  }
}
