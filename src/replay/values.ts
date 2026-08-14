import type { Capability, ValueRef } from "../schema/capability";

export function resolveValue(
  ref: ValueRef,
  params: Record<string, string>,
  entryPoint: string,
): string {
  switch (ref.kind) {
    case "literal":
      return ref.value;
    case "entry":
      return entryPoint;
    case "param": {
      const value = params[ref.name];
      if (value === undefined) {
        throw new Error(`missing parameter "${ref.name}"`);
      }
      return value;
    }
  }
}

export function entryPointOf(
  capability: Capability,
  override?: string,
): string {
  return override ?? capability.app.entryPoint;
}
