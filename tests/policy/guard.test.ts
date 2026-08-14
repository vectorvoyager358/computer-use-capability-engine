import { describe, expect, it } from "vitest";
import { authorizeUrl } from "../../src/policy/authorize";
import { redactText } from "../../src/policy/redact";
import { DEFAULT_POLICY } from "../../src/policy/schema";
import { replay } from "../../src/replay/engine";
import { parseCapability } from "../../src/schema/capability";
import { RecordingSurface } from "../helpers/recording-surface";

const clickTarget = {
  candidates: [{ strategy: "role_name" as const, role: "button", name: "Go" }],
};

function capability(overrides: Record<string, unknown> = {}) {
  return parseCapability({
    schemaVersion: "1.0.0",
    id: "policy-probe",
    name: "Policy probe",
    description: "Tiny flow for policy tests",
    revision: 1,
    app: {
      family: "core-servicing",
      surface: "web",
      entryPoint: "http://127.0.0.1:4173/",
    },
    parameters: [
      {
        name: "memberId",
        type: "string",
        sensitivity: "identifier",
        description: "Member number",
      },
    ],
    outputs: [],
    steps: [
      {
        id: "open-app",
        action: "navigate",
        url: { kind: "entry" },
        risk: "read",
      },
    ],
    success: { checkpoint: { kind: "text", value: "ok" } },
    ...overrides,
  });
}

describe("redactText", () => {
  it("replaces identifier param values and leaves other text", () => {
    expect(
      redactText("member 10001 not found", { memberId: "10001" }, [
        {
          name: "memberId",
          type: "string",
          sensitivity: "identifier",
          description: "Member number",
        },
      ]),
    ).toBe("member [memberId] not found");
  });
});

describe("authorizeUrl", () => {
  it("allows the local mock host", () => {
    expect(
      authorizeUrl("http://127.0.0.1:4173/member?id=1", DEFAULT_POLICY),
    ).toBeNull();
  });

  it("blocks a host outside the allowlist", () => {
    const denial = authorizeUrl("https://evil.example/steal", DEFAULT_POLICY);
    expect(denial?.kind).toBe("block");
    expect(denial?.reason).toContain("evil.example");
  });
});

describe("replay policy", () => {
  it("does not navigate to a disallowed host", async () => {
    const surface = new RecordingSurface();
    const result = await replay(
      capability({
        app: {
          family: "core-servicing",
          surface: "web",
          entryPoint: "https://evil.example/",
        },
      }),
      { surface },
    );

    expect(result.status).toBe("failed");
    expect(surface.gotos).toEqual([]);
    if (result.status === "failed") {
      expect(result.expected).toBe("policy allowlist");
      expect(result.observed).toContain("evil.example");
    }
  });

  it("escalates an irreversible step and does not click", async () => {
    const surface = new RecordingSurface();
    const result = await replay(
      capability({
        steps: [
          {
            id: "submit-transfer",
            action: "click",
            target: clickTarget,
            risk: "irreversible",
          },
        ],
      }),
      { surface },
    );

    expect(result.status).toBe("escalated");
    expect(surface.clicks).toBe(0);
    if (result.status === "escalated") {
      expect(result.reason).toContain("irreversible");
    }
  });

  it("blocks an irreversible step when policy says block", async () => {
    const surface = new RecordingSurface();
    const result = await replay(
      capability({
        steps: [
          {
            id: "submit-transfer",
            action: "click",
            target: clickTarget,
            risk: "irreversible",
          },
        ],
      }),
      {
        surface,
        policy: { ...DEFAULT_POLICY, onIrreversible: "block" },
      },
    );

    expect(result.status).toBe("failed");
    expect(surface.clicks).toBe(0);
  });

  it("blocks a path outside the allowlist", async () => {
    const surface = new RecordingSurface();
    const result = await replay(capability(), {
      surface,
      policy: { ...DEFAULT_POLICY, allowedPathPrefixes: ["/member"] },
    });

    expect(result.status).toBe("failed");
    expect(surface.gotos).toEqual([]);
    if (result.status === "failed") {
      expect(result.observed).toContain('path "/"');
    }
  });
});
