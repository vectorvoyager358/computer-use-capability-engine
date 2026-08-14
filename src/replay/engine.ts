import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Handoff } from "../handoff/types";
import { authorize } from "../policy/authorize";
import { redactText } from "../policy/redact";
import { DEFAULT_POLICY, type Policy } from "../policy/schema";
import type { Capability, ExceptionHandler, Step } from "../schema/capability";
import type { ReplayResult } from "../schema/result";
import { parseReplayResult } from "../schema/result";
import { RunSession } from "../session/session";
import { describeTarget, LocatorError, type Surface } from "../surface/surface";
import { matchingHandler } from "./handlers";
import { entryPointOf, resolveValue } from "./values";

export type ReplayOptions = {
  surface: Surface;
  entryPoint?: string;
  evidenceDir?: string;
  params?: Record<string, string>;
  policy?: Policy;
  handoff?: Handoff;
  session?: RunSession;
};

type Event = ReplayResult["events"][number];

export async function replay(
  capability: Capability,
  options: ReplayOptions,
): Promise<ReplayResult> {
  const params = options.params ?? {};
  const entryPoint = entryPointOf(capability, options.entryPoint);
  const policy = options.policy ?? DEFAULT_POLICY;
  if (options.session && options.session.surface !== options.surface) {
    throw new Error("session.surface must be the replay surface");
  }
  const session = options.session ?? new RunSession(options.surface);
  const surface = session.surface;
  const events: Event[] = [];
  const outputs: Record<string, unknown> = {};

  const scrub = (text: string) =>
    redactText(text, params, capability.parameters);

  const fail = async (
    step: Step,
    expected: string,
    observed: string,
  ): Promise<ReplayResult> => {
    let evidencePath: string | undefined;
    if (options.evidenceDir) {
      await mkdir(options.evidenceDir, { recursive: true });
      evidencePath = join(
        options.evidenceDir,
        `${capability.id}-${step.id}.png`,
      );
      await surface.screenshot(evidencePath);
    }
    return parseReplayResult({
      status: "failed",
      capabilityId: capability.id,
      revision: capability.revision,
      stepId: step.id,
      expected,
      observed: scrub(observed),
      evidencePath,
      events,
    });
  };

  const escalate = async (
    step: Step,
    reason: string,
  ): Promise<ReplayResult | "skip_step" | "retry_step"> => {
    events.push({
      type: "escalated",
      stepId: step.id,
      detail: reason,
    });
    if (!options.handoff) {
      return parseReplayResult({
        status: "escalated",
        capabilityId: capability.id,
        revision: capability.revision,
        stepId: step.id,
        reason,
        events,
      });
    }

    session.cede();
    let screenshotPath: string | undefined;
    if (options.evidenceDir) {
      await mkdir(options.evidenceDir, { recursive: true });
      screenshotPath = join(
        options.evidenceDir,
        `${capability.id}-${step.id}-hitl.png`,
      );
      await surface.screenshot(screenshotPath);
    }
    const outcome = await options.handoff.intervene(session, {
      capabilityId: capability.id,
      step,
      reason,
      observation: await surface.observe(),
      screenshotPath,
    });
    for (const action of outcome.actions) {
      events.push({
        type: "human",
        stepId: step.id,
        detail: action.detail,
      });
    }
    session.resume();
    if (session.owner !== "automation") {
      throw new Error("handoff returned without restoring automation control");
    }
    if (outcome.resume === "abort") {
      return parseReplayResult({
        status: "escalated",
        capabilityId: capability.id,
        revision: capability.revision,
        stepId: step.id,
        reason,
        events,
      });
    }
    return outcome.resume;
  };

  let index = 0;
  while (index < capability.steps.length) {
    const step = capability.steps[index];
    if (!step) break;

    let resolvedUrl: string | undefined;
    if (step.action === "navigate") {
      try {
        resolvedUrl = resolveValue(step.url, params, entryPoint);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith("missing parameter")
        ) {
          return fail(step, error.message, "parameter not supplied");
        }
        throw error;
      }
    }

    const denial = authorize(step, resolvedUrl, policy);
    if (denial?.kind === "escalate") {
      const next = await escalate(step, denial.reason);
      if (next === "skip_step") {
        index += 1;
        continue;
      }
      if (next === "retry_step") continue;
      return next;
    }
    if (denial?.kind === "block") {
      return fail(step, "policy allowlist", denial.reason);
    }

    try {
      await runStep(step, {
        params,
        entryPoint,
        surface,
        outputs,
        resolvedUrl,
      });
    } catch (error) {
      if (error instanceof LocatorError) {
        events.push({
          type: "acted",
          stepId: step.id,
          detail: "locator miss after retries",
        });
        return fail(step, error.expected, error.observed);
      }
      if (
        error instanceof Error &&
        error.message.startsWith("missing parameter")
      ) {
        return fail(step, error.message, "parameter not supplied");
      }
      throw error;
    }

    events.push({
      type: "acted",
      stepId: step.id,
      detail: describeStep(step),
    });

    const observation = await surface.observe();
    const handler = matchingHandler(step.on, observation);
    if (!handler) {
      index += 1;
      continue;
    }

    const handled = await applyHandler(handler, step, {
      surface,
      events,
    });
    if (handled === "continue") {
      index += 1;
      continue;
    }
    if (handled.status === "business_outcome") {
      return parseReplayResult({
        status: "business_outcome",
        capabilityId: capability.id,
        revision: capability.revision,
        code: handled.code,
        events,
      });
    }
    if (handled.status === "escalated") {
      const next = await escalate(step, handled.reason);
      if (next === "skip_step") {
        index += 1;
        continue;
      }
      if (next === "retry_step") continue;
      return next;
    }
    return fail(step, handled.expected, handled.observed);
  }

  const checkpoint = capability.success.checkpoint;
  if (!(await surface.checkpointMet(checkpoint))) {
    const last = capability.steps.at(-1);
    const observed = (await surface.observe()).text.slice(0, 240);
    events.push({
      type: "checkpoint",
      detail: `failed ${checkpoint.kind} "${checkpoint.value}"`,
    });
    if (!last) {
      throw new Error("capability has no steps");
    }
    return fail(
      last,
      `${checkpoint.kind} "${checkpoint.value}"`,
      observed || "(empty page)",
    );
  }

  events.push({
    type: "checkpoint",
    detail: `${checkpoint.kind} "${checkpoint.value}"`,
  });

  return parseReplayResult({
    status: "success",
    capabilityId: capability.id,
    revision: capability.revision,
    outputs,
    events,
  });
}

async function runStep(
  step: Step,
  ctx: {
    params: Record<string, string>;
    entryPoint: string;
    surface: Surface;
    outputs: Record<string, unknown>;
    resolvedUrl?: string;
  },
) {
  switch (step.action) {
    case "navigate":
      await ctx.surface.goto(ctx.resolvedUrl ?? ctx.entryPoint);
      return;
    case "click":
      await ctx.surface.click(step.target);
      return;
    case "fill":
      await ctx.surface.fill(
        step.target,
        resolveValue(step.value, ctx.params, ctx.entryPoint),
      );
      return;
    case "select":
      await ctx.surface.select(
        step.target,
        resolveValue(step.value, ctx.params, ctx.entryPoint),
      );
      return;
    case "extract":
      ctx.outputs[step.output] = await ctx.surface.extract(step.target);
      return;
    case "assert":
      if (!(await ctx.surface.checkpointMet(step.checkpoint))) {
        throw new LocatorError(
          `${step.checkpoint.kind} "${step.checkpoint.value}"`,
          (await ctx.surface.observe()).text.slice(0, 240),
        );
      }
      return;
    case "dismiss":
      await ctx.surface.dismiss(step.target);
      return;
    case "wait":
      if (!(await ctx.surface.checkpointMet(step.until))) {
        throw new LocatorError(
          `${step.until.kind} "${step.until.value}"`,
          (await ctx.surface.observe()).text.slice(0, 240),
        );
      }
  }
}

function describeStep(step: Step): string {
  switch (step.action) {
    case "navigate":
      return "navigate";
    case "click":
      return `click ${describeTarget(step.target)}`;
    case "fill":
      return step.value.kind === "param"
        ? `fill from param.${step.value.name}`
        : "fill";
    case "select":
      return "select";
    case "extract":
      return `extract ${step.output}`;
    case "assert":
      return `assert ${step.checkpoint.kind}`;
    case "dismiss":
      return "dismiss";
    case "wait":
      return "wait";
  }
}

type HandlerResult =
  | "continue"
  | { status: "business_outcome"; code: string }
  | { status: "escalated"; reason: string }
  | { status: "failed"; expected: string; observed: string };

async function applyHandler(
  handler: ExceptionHandler,
  step: Step,
  ctx: { surface: Surface; events: Event[] },
): Promise<HandlerResult> {
  const then = handler.then;
  switch (then.type) {
    case "business_outcome":
      return { status: "business_outcome", code: then.code };
    case "escalate":
      return { status: "escalated", reason: then.reason };
    case "fail":
      return {
        status: "failed",
        expected: then.reason,
        observed: (await ctx.surface.observe()).text.slice(0, 240),
      };
    case "recover": {
      const attempts = then.maxAttempts ?? 1;
      for (let i = 0; i < attempts; i += 1) {
        if (then.action === "dismiss" && "target" in step) {
          await ctx.surface.dismiss(step.target);
        } else if (then.action === "wait") {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        ctx.events.push({
          type: "recovered",
          stepId: step.id,
          detail: `${then.action} (${i + 1}/${attempts})`,
        });
        const again = matchingHandler(step.on, await ctx.surface.observe());
        if (!again) return "continue";
      }
      return {
        status: "failed",
        expected: `recover via ${then.action}`,
        observed: (await ctx.surface.observe()).text.slice(0, 240),
      };
    }
  }
}
