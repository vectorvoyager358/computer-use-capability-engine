import { z } from "zod";

/** How sensitive a value is. Discovery/replay must not persist `secret` or `full_pii`. */
export const SensitivitySchema = z.enum([
  "none",
  "identifier",
  "financial",
  "secret",
  "full_pii",
]);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const ParamTypeSchema = z.enum(["string", "number", "boolean"]);
export const OutputTypeSchema = z.enum(["string", "number", "boolean", "money"]);

export const ParameterSchema = z.strictObject({
  name: z.string().min(1),
  type: ParamTypeSchema,
  sensitivity: SensitivitySchema,
  description: z.string().min(1),
});
export type Parameter = z.infer<typeof ParameterSchema>;

export const OutputFieldSchema = z.strictObject({
  name: z.string().min(1),
  type: OutputTypeSchema,
  sensitivity: SensitivitySchema,
  description: z.string().min(1),
});
export type OutputField = z.infer<typeof OutputFieldSchema>;

/**
 * Ranked from most robust on a no-clean-DOM surface to least.
 * Replay tries candidates in order; CSS is last-resort, not the default.
 */
export const LocatorSchema = z.discriminatedUnion("strategy", [
  z.strictObject({
    strategy: z.literal("role_name"),
    role: z.string().min(1),
    name: z.string().min(1),
    exact: z.boolean().optional(),
  }),
  z.strictObject({
    strategy: z.literal("label"),
    label: z.string().min(1),
  }),
  z.strictObject({
    strategy: z.literal("nearby_text"),
    text: z.string().min(1),
    role: z.string().min(1).optional(),
  }),
  z.strictObject({
    strategy: z.literal("table_cell"),
    rowText: z.string().min(1),
    columnHeader: z.string().min(1),
  }),
  z.strictObject({
    strategy: z.literal("structural"),
    path: z.string().min(1),
  }),
  z.strictObject({
    strategy: z.literal("css"),
    selector: z.string().min(1),
  }),
]);
export type Locator = z.infer<typeof LocatorSchema>;

export const LocatorSetSchema = z.strictObject({
  candidates: z.array(LocatorSchema).min(1),
});
export type LocatorSet = z.infer<typeof LocatorSetSchema>;

export const ValueRefSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("param"), name: z.string().min(1) }),
  z.strictObject({ kind: z.literal("literal"), value: z.string() }),
  z.strictObject({ kind: z.literal("entry") }),
]);
export type ValueRef = z.infer<typeof ValueRefSchema>;

export const RiskSchema = z.enum(["read", "reversible", "irreversible"]);
export type Risk = z.infer<typeof RiskSchema>;

export const ObservationMatchSchema = z.strictObject({
  kind: z.enum(["text", "url", "dialog", "role_name"]),
  value: z.string().min(1),
});
export type ObservationMatch = z.infer<typeof ObservationMatchSchema>;

export const ExceptionThenSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("business_outcome"),
    code: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("recover"),
    action: z.enum(["dismiss", "retry", "wait"]),
    maxAttempts: z.number().int().positive().optional(),
  }),
  z.strictObject({
    type: z.literal("escalate"),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("fail"),
    reason: z.string().min(1),
  }),
]);
export type ExceptionThen = z.infer<typeof ExceptionThenSchema>;

export const ExceptionHandlerSchema = z.strictObject({
  match: ObservationMatchSchema,
  then: ExceptionThenSchema,
});
export type ExceptionHandler = z.infer<typeof ExceptionHandlerSchema>;

export const CheckpointSchema = z.strictObject({
  kind: z.enum(["text", "url", "heading", "role_name"]),
  value: z.string().min(1),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

const stepBase = {
  id: z.string().min(1),
  description: z.string().min(1).optional(),
  risk: RiskSchema,
  on: z.array(ExceptionHandlerSchema).optional(),
};

export const StepSchema = z.discriminatedUnion("action", [
  z.strictObject({
    ...stepBase,
    action: z.literal("navigate"),
    url: ValueRefSchema,
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("click"),
    target: LocatorSetSchema,
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("fill"),
    target: LocatorSetSchema,
    value: ValueRefSchema,
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("select"),
    target: LocatorSetSchema,
    value: ValueRefSchema,
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("extract"),
    target: LocatorSetSchema,
    output: z.string().min(1),
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("assert"),
    checkpoint: CheckpointSchema,
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("dismiss"),
    target: LocatorSetSchema,
  }),
  z.strictObject({
    ...stepBase,
    action: z.literal("wait"),
    until: CheckpointSchema,
  }),
]);
export type Step = z.infer<typeof StepSchema>;

export const AppRefSchema = z.strictObject({
  family: z.string().min(1),
  surface: z.enum(["web", "desktop"]),
  entryPoint: z.string().min(1),
});
export type AppRef = z.infer<typeof AppRefSchema>;

export const SCHEMA_VERSION = "1.0.0" as const;

export const CapabilitySchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    revision: z.number().int().positive(),
    app: AppRefSchema,
    parameters: z.array(ParameterSchema),
    outputs: z.array(OutputFieldSchema),
    steps: z.array(StepSchema).min(1),
    success: z.strictObject({
      checkpoint: CheckpointSchema,
      outputs: z.array(z.string().min(1)).optional(),
    }),
  })
  .superRefine((capability, ctx) => {
    const paramNames = new Set(capability.parameters.map((p) => p.name));
    const outputNames = new Set(capability.outputs.map((o) => o.name));

    if (paramNames.size !== capability.parameters.length) {
      ctx.addIssue({
        code: "custom",
        message: "parameter names must be unique",
        path: ["parameters"],
      });
    }
    if (outputNames.size !== capability.outputs.length) {
      ctx.addIssue({
        code: "custom",
        message: "output names must be unique",
        path: ["outputs"],
      });
    }

    for (const [index, step] of capability.steps.entries()) {
      if ("value" in step && step.value.kind === "param" && !paramNames.has(step.value.name)) {
        ctx.addIssue({
          code: "custom",
          message: `step value refers to unknown parameter "${step.value.name}"`,
          path: ["steps", index, "value", "name"],
        });
      }
      if (step.action === "extract" && !outputNames.has(step.output)) {
        ctx.addIssue({
          code: "custom",
          message: `extract step refers to unknown output "${step.output}"`,
          path: ["steps", index, "output"],
        });
      }
    }

    for (const [index, name] of (capability.success.outputs ?? []).entries()) {
      if (!outputNames.has(name)) {
        ctx.addIssue({
          code: "custom",
          message: `success.outputs refers to unknown output "${name}"`,
          path: ["success", "outputs", index],
        });
      }
    }
  });

export type Capability = z.infer<typeof CapabilitySchema>;

export function parseCapability(data: unknown): Capability {
  return CapabilitySchema.parse(data);
}
