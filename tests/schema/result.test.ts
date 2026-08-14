import { describe, expect, it } from "vitest";
import { parseReplayResult } from "../../src/schema/result";

describe("ReplayResultSchema", () => {
  it("parses success with typed outputs", () => {
    const result = parseReplayResult({
      status: "success",
      capabilityId: "lookup-member-savings",
      revision: 1,
      outputs: { savingsBalance: "$1,240.50" },
      events: [{ type: "checkpoint", stepId: "extract-balance", detail: "heading Member detail" }],
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.outputs.savingsBalance).toBe("$1,240.50");
    }
  });

  it("parses member-not-found as a business outcome, not a failure", () => {
    const result = parseReplayResult({
      status: "business_outcome",
      capabilityId: "lookup-member-savings",
      revision: 1,
      code: "member_not_found",
      events: [
        {
          type: "acted",
          stepId: "click-search",
          detail: "observed text: Member not found",
        },
      ],
    });

    expect(result.status).toBe("business_outcome");
    if (result.status === "business_outcome") {
      expect(result.code).toBe("member_not_found");
    }
  });

  it("parses a hard failure with step, expected, observed", () => {
    const result = parseReplayResult({
      status: "failed",
      capabilityId: "lookup-member-savings",
      revision: 1,
      stepId: "click-search",
      expected: "button Search",
      observed: "dialog: Session expired",
      evidencePath: "evidence/replay-failed.png",
      events: [{ type: "acted", stepId: "click-search", detail: "locator miss after retries" }],
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.stepId).toBe("click-search");
      expect(result.evidencePath).toBe("evidence/replay-failed.png");
    }
  });

  it("parses escalation when a human must take the live session", () => {
    const result = parseReplayResult({
      status: "escalated",
      capabilityId: "lookup-member-savings",
      revision: 1,
      stepId: "click-search",
      reason: "unhandled confirmation dialog",
      events: [{ type: "escalated", stepId: "click-search", detail: "control ceded to human" }],
    });

    expect(result.status).toBe("escalated");
  });

  it("rejects recovered as a terminal status", () => {
    expect(() =>
      parseReplayResult({
        status: "recovered",
        capabilityId: "lookup-member-savings",
        revision: 1,
        events: [],
      }),
    ).toThrow();
  });

  it("records recovery as an event on a successful run", () => {
    const result = parseReplayResult({
      status: "success",
      capabilityId: "lookup-member-savings",
      revision: 1,
      outputs: { savingsBalance: "$1,240.50" },
      events: [
        {
          type: "recovered",
          stepId: "open-app",
          detail: "dismissed interstitial; retried load",
        },
      ],
    });

    expect(result.events[0]?.type).toBe("recovered");
  });
});
