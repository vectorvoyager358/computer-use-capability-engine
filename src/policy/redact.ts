import type { Parameter } from "../schema/capability";

const SENSITIVE = new Set(["identifier", "financial", "secret", "full_pii"]);

export function redactText(
  text: string,
  params: Record<string, string>,
  fields: Parameter[],
): string {
  let redacted = text;
  for (const field of fields) {
    if (!SENSITIVE.has(field.sensitivity)) continue;
    const value = params[field.name];
    if (!value) continue;
    redacted = redacted.split(value).join(`[${field.name}]`);
  }
  return redacted;
}
