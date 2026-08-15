import {
  type Capability,
  parseCapability,
  SCHEMA_VERSION,
  type Step,
} from "../schema/capability";
import type { Decision } from "./decision";
import { clickRisk, roleTarget, slug, tableTarget } from "./targets";

export type RecordedAct =
  | { action: "navigate" }
  | {
      action: "fill";
      role: string;
      name: string;
      value: string;
      param?: string;
    }
  | { action: "click"; role: string; name: string }
  | {
      action: "extract";
      rowText: string;
      columnHeader: string;
      output: string;
      outputType?: "string" | "number" | "boolean" | "money";
    };

export function compileCapability(input: {
  entryPoint: string;
  appFamily: string;
  params: Record<string, string>;
  acts: RecordedAct[];
  done: Extract<Decision, { type: "done" }>;
}): Capability {
  const paramNames = new Set<string>();
  const outputs = new Map<
    string,
    { type: "string" | "number" | "boolean" | "money"; description: string }
  >();
  const steps: Step[] = [];
  const lastClickIndexByName = new Map<string, number>();
  const seenCells = new Set<string>();

  for (const act of input.acts) {
    if (act.action === "navigate") {
      steps.push({
        id: "open-app",
        action: "navigate",
        url: { kind: "entry" },
        risk: "read",
      });
      continue;
    }
    if (act.action === "fill") {
      const param =
        act.param ??
        Object.entries(input.params).find(
          ([, value]) => value === act.value,
        )?.[0];
      if (param) paramNames.add(param);
      steps.push({
        id: `fill-${slug(act.name)}`,
        action: "fill",
        target: roleTarget(act.role, act.name),
        value: param
          ? { kind: "param", name: param }
          : { kind: "literal", value: act.value },
        risk: "reversible",
      });
      continue;
    }
    if (act.action === "click") {
      lastClickIndexByName.set(act.name, steps.length);
      steps.push({
        id: `click-${slug(act.name)}`,
        action: "click",
        target: roleTarget(act.role, act.name),
        risk: clickRisk(act.name),
      });
      continue;
    }
    const cell = `${act.rowText}\0${act.columnHeader}`;
    if (seenCells.has(cell)) continue;
    seenCells.add(cell);
    const output = outputName(act);
    outputs.set(output, {
      type: act.outputType ?? (act.rowText === "Savings" ? "money" : "string"),
      description: `Value of ${act.rowText} / ${act.columnHeader}`,
    });
    steps.push({
      id: `extract-${slug(output)}`,
      action: "extract",
      target: tableTarget(act.rowText, act.columnHeader),
      output,
      risk: "read",
    });
  }

  const outcomes =
    input.done.businessOutcomes && input.done.businessOutcomes.length > 0
      ? input.done.businessOutcomes
      : lastClickIndexByName.has("Search")
        ? [{ matchText: "Member not found", code: "member_not_found" }]
        : [];
  for (const outcome of outcomes) {
    const searchIndex =
      lastClickIndexByName.get("Search") ??
      [...lastClickIndexByName.values()].at(-1);
    if (searchIndex === undefined) continue;
    const step = steps[searchIndex];
    if (step?.action !== "click") continue;
    const existing = step.on ?? [];
    steps[searchIndex] = {
      ...step,
      on: [
        ...existing,
        {
          match: { kind: "text", value: outcome.matchText },
          // biome-ignore lint/suspicious/noThenProperty: handler verb in the artifact, not a thenable
          then: { type: "business_outcome", code: outcome.code },
        },
      ],
    };
  }

  const parameters = [...paramNames].map((name) => ({
    name,
    type: "string" as const,
    sensitivity: /id|ssn|account/i.test(name)
      ? ("identifier" as const)
      : ("none" as const),
    description: `Invocation parameter ${name}`,
  }));

  const name = scrubParams(input.done.name, input.params);
  const description = scrubParams(input.done.description, input.params);
  const checkpointValue = scrubParams(input.done.checkpointValue, input.params);
  const moneyCheckpoint = /^\$[\d,.]+$/.test(checkpointValue);
  const checkpoint = moneyCheckpoint
    ? { kind: "heading" as const, value: "Member detail" }
    : {
        kind: input.done.checkpointKind,
        value: checkpointValue,
      };

  return parseCapability({
    schemaVersion: SCHEMA_VERSION,
    id: slug(name),
    name,
    description,
    revision: 1,
    app: {
      family: input.appFamily,
      surface: "web",
      entryPoint: input.entryPoint,
    },
    parameters,
    outputs: [...outputs.entries()].map(([name, field]) => ({
      name,
      type: field.type,
      sensitivity: field.type === "money" ? "financial" : "none",
      description: field.description,
    })),
    steps,
    success: {
      checkpoint,
      outputs: [...outputs.keys()],
    },
  });
}

function outputName(act: Extract<RecordedAct, { action: "extract" }>): string {
  if (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(act.output) &&
    act.output !== "string" &&
    act.output !== "number" &&
    act.output !== "boolean"
  ) {
    return act.output;
  }
  if (act.rowText.toLowerCase() === "savings") return "savingsBalance";
  return slug(`${act.rowText}-${act.columnHeader}`).replaceAll("-", "_");
}

function scrubParams(text: string, params: Record<string, string>): string {
  let out = text;
  for (const [name, value] of Object.entries(params)) {
    if (!value) continue;
    out = out.split(value).join(`[${name}]`);
  }
  return out;
}
