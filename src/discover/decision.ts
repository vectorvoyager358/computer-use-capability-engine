import { z } from "zod";
import type { Control, Observation } from "../surface/surface";

export const DecisionSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("fill"),
    role: z.string().min(1),
    name: z.string().min(1),
    value: z.string(),
    param: z.string().min(1).optional(),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("click"),
    role: z.string().min(1),
    name: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("extract"),
    rowText: z.string().min(1),
    columnHeader: z.string().min(1),
    output: z.string().min(1),
    outputType: z.enum(["string", "number", "boolean", "money"]).optional(),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("done"),
    name: z.string().min(1),
    description: z.string().min(1),
    checkpointKind: z.enum(["text", "url", "heading", "role_name"]),
    checkpointValue: z.string().min(1),
    businessOutcomes: z
      .array(
        z.strictObject({
          matchText: z.string().min(1),
          code: z.string().min(1),
        }),
      )
      .optional(),
    reason: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("give_up"),
    reason: z.string().min(1),
  }),
]);
export type Decision = z.infer<typeof DecisionSchema>;

export type ModelInput = {
  goal: string;
  observation: Observation;
  inventory: Control[];
  history: string[];
  paramNames: string[];
  params: Record<string, string>;
};

export type Model = {
  readonly name: string;
  decide(input: ModelInput): Promise<Decision>;
};
