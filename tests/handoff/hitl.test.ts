import { describe, expect, it } from "vitest";
import { ScriptedOperator } from "../../src/handoff/scripted";
import { replay } from "../../src/replay/engine";
import { parseCapability } from "../../src/schema/capability";
import { RunSession } from "../../src/session/session";
import { RecordingSurface } from "../helpers/recording-surface";

const clickTarget = {
  candidates: [{ strategy: "role_name" as const, role: "button", name: "Go" }],
};

function capability(overrides: Record<string, unknown> = {}) {
  return parseCapability({
    schemaVersion: "1.0.0",
    id: "hitl-probe",
    name: "HITL probe",
    description: "Tiny flow for handoff tests",
    revision: 1,
    app: {
      family: "core-servicing",
      surface: "web",
      entryPoint: "http://127.0.0.1:4173/",
    },
    parameters: [],
    outputs: [
      {
        name: "savingsBalance",
        type: "money",
        sensitivity: "financial",
        description: "Balance after the human finishes the blocked step",
      },
    ],
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

describe("HITL handoff", () => {
  it("lets a human act on the same surface, then continues remaining steps", async () => {
    const surface = new RecordingSurface();
    const session = new RunSession(surface);
    let ownerDuringIntervene: string | undefined;

    const result = await replay(
      capability({
        steps: [
          {
            id: "open-app",
            action: "navigate",
            url: { kind: "entry" },
            risk: "read",
          },
          {
            id: "submit",
            action: "click",
            target: clickTarget,
            risk: "irreversible",
          },
          {
            id: "extract-balance",
            action: "extract",
            target: {
              candidates: [{ strategy: "css", selector: "td" }],
            },
            output: "savingsBalance",
            risk: "read",
          },
        ],
      }),
      {
        surface,
        session,
        handoff: new ScriptedOperator(async (owned, request) => {
          ownerDuringIntervene = owned.owner;
          expect(owned.surface).toBe(surface);
          if (request.step.action !== "click") {
            throw new Error("expected click step");
          }
          await owned.surface.click(request.step.target);
          return {
            actions: [{ type: "click", detail: "clicked Go" }],
            resume: "skip_step",
          };
        }),
      },
    );

    expect(ownerDuringIntervene).toBe("human");
    expect(session.owner).toBe("automation");
    expect(result.status).toBe("success");
    expect(surface.clicks).toBe(1);
    expect(surface.gotos).toEqual(["http://127.0.0.1:4173/"]);
    expect(
      result.events.some(
        (event) => event.type === "human" && event.detail === "clicked Go",
      ),
    ).toBe(true);
    expect(
      result.events.some(
        (event) => event.type === "acted" && event.stepId === "extract-balance",
      ),
    ).toBe(true);
  });

  it("aborts as escalated and restores automation control", async () => {
    const surface = new RecordingSurface();
    const session = new RunSession(surface);
    const result = await replay(
      capability({
        steps: [
          {
            id: "submit",
            action: "click",
            target: clickTarget,
            risk: "irreversible",
          },
        ],
      }),
      {
        surface,
        session,
        handoff: new ScriptedOperator(async (owned) => {
          expect(owned.owner).toBe("human");
          return {
            actions: [{ type: "other", detail: "operator aborted" }],
            resume: "abort",
          };
        }),
      },
    );

    expect(result.status).toBe("escalated");
    expect(session.owner).toBe("automation");
    expect(surface.clicks).toBe(0);
    if (result.status === "escalated") {
      expect(result.reason).toContain("irreversible");
    }
    expect(result.events.some((event) => event.type === "human")).toBe(true);
  });
});
