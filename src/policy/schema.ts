import { z } from "zod";

export const PolicySchema = z.strictObject({
  allowedHosts: z.array(z.string().min(1)).min(1),
  allowedPathPrefixes: z.array(z.string().min(1)).default(["/"]),
  allowedActions: z
    .array(
      z.enum([
        "navigate",
        "click",
        "fill",
        "select",
        "extract",
        "assert",
        "dismiss",
        "wait",
      ]),
    )
    .min(1),
  onIrreversible: z.enum(["escalate", "block"]),
});

export type Policy = z.infer<typeof PolicySchema>;

export function parsePolicy(data: unknown): Policy {
  return PolicySchema.parse(data);
}

export const DEFAULT_POLICY: Policy = {
  allowedHosts: ["127.0.0.1", "localhost"],
  allowedPathPrefixes: ["/"],
  allowedActions: [
    "navigate",
    "click",
    "fill",
    "select",
    "extract",
    "assert",
    "dismiss",
    "wait",
  ],
  onIrreversible: "escalate",
};
