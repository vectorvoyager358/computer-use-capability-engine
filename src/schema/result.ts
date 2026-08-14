import { z } from "zod";

const EventSchema = z.strictObject({
  type: z.enum(["acted", "recovered", "checkpoint", "escalated", "human"]),
  stepId: z.string().min(1).optional(),
  detail: z.string().min(1),
});

/**
 * Caller-facing replay contract.
 * Recoverable conditions are events during the run, not a terminal status:
 * if recovery works, the caller still gets success / business_outcome.
 */
export const ReplayResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("success"),
    capabilityId: z.string().min(1),
    revision: z.number().int().positive(),
    outputs: z.record(z.string(), z.unknown()),
    events: z.array(EventSchema),
  }),
  z.strictObject({
    status: z.literal("business_outcome"),
    capabilityId: z.string().min(1),
    revision: z.number().int().positive(),
    code: z.string().min(1),
    events: z.array(EventSchema),
  }),
  z.strictObject({
    status: z.literal("escalated"),
    capabilityId: z.string().min(1),
    revision: z.number().int().positive(),
    stepId: z.string().min(1),
    reason: z.string().min(1),
    events: z.array(EventSchema),
  }),
  z.strictObject({
    status: z.literal("failed"),
    capabilityId: z.string().min(1),
    revision: z.number().int().positive(),
    stepId: z.string().min(1),
    expected: z.string().min(1),
    observed: z.string().min(1),
    evidencePath: z.string().min(1).optional(),
    events: z.array(EventSchema),
  }),
]);
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

export function parseReplayResult(data: unknown): ReplayResult {
  return ReplayResultSchema.parse(data);
}
