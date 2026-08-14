import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCapability, SCHEMA_VERSION } from "../../src/schema/capability";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/lookup-member-savings.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;

describe("CapabilitySchema", () => {
  it("parses the lookup-member fixture as a reviewable capability", () => {
    const capability = parseCapability(fixture);

    expect(capability.schemaVersion).toBe(SCHEMA_VERSION);
    expect(capability.id).toBe("lookup-member-savings");
    expect(capability.parameters[0]?.name).toBe("memberId");
    expect(capability.outputs[0]?.name).toBe("savingsBalance");

    const fill = capability.steps.find((step) => step.action === "fill");
    expect(fill?.action === "fill" && fill.value).toEqual({
      kind: "param",
      name: "memberId",
    });
  });

  it("does not store the member id as a literal in recorded steps", () => {
    const json = JSON.stringify(fixture);
    expect(json).not.toMatch(/12345/);
    expect(json).not.toMatch(/password/i);
  });

  it("rejects a fill step that omits value", () => {
    const invalid = structuredClone(fixture) as Record<string, unknown>;
    const steps = invalid.steps as Array<Record<string, unknown>>;
    steps[1] = { id: "fill-member-id", action: "fill", risk: "reversible" };

    expect(() => parseCapability(invalid)).toThrow();
  });

  it("rejects an unknown locator strategy", () => {
    const invalid = structuredClone(fixture) as Record<string, unknown>;
    const steps = invalid.steps as Array<Record<string, unknown>>;
    steps[2] = {
      id: "click-search",
      action: "click",
      risk: "read",
      target: { candidates: [{ strategy: "xpath", expression: "//button" }] },
    };

    expect(() => parseCapability(invalid)).toThrow();
  });

  it("rejects unknown keys so a reviewed artifact cannot silently drop fields", () => {
    const invalid = { ...(fixture as object), extra: true };

    expect(() => parseCapability(invalid)).toThrow();
  });

  it("rejects a value that refers to a missing parameter", () => {
    const invalid = structuredClone(fixture) as {
      steps: Array<{ value?: { kind: string; name?: string } }>;
    };
    const fill = invalid.steps[1];
    if (fill?.value) fill.value.name = "accountId";

    expect(() => parseCapability(invalid)).toThrow(/unknown parameter/);
  });

  it("rejects an extract that refers to a missing output", () => {
    const invalid = structuredClone(fixture) as {
      steps: Array<{ output?: string }>;
    };
    const extract = invalid.steps[3];
    if (extract) extract.output = "checkingBalance";

    expect(() => parseCapability(invalid)).toThrow(/unknown output/);
  });
});
