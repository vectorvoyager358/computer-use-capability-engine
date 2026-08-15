import { describe, expect, it } from "vitest";
import { compileCapability } from "../../src/discover/compile";

describe("compileCapability", () => {
  it("parameterizes filled values and omits them from the artifact", () => {
    const capability = compileCapability({
      entryPoint: "http://127.0.0.1:4173/",
      appFamily: "core-servicing",
      params: { memberId: "10001" },
      acts: [
        { action: "navigate" },
        {
          action: "fill",
          role: "textbox",
          name: "Member ID",
          value: "10001",
        },
        { action: "click", role: "button", name: "Search" },
        { action: "click", role: "button", name: "Continue" },
        {
          action: "extract",
          rowText: "Savings",
          columnHeader: "Balance",
          output: "savingsBalance",
          outputType: "money",
        },
      ],
      done: {
        type: "done",
        name: "Look up member savings balance",
        description: "Retrieved savings balance for member 10001",
        checkpointKind: "heading",
        checkpointValue: "Member detail",
        businessOutcomes: [
          { matchText: "Member not found", code: "member_not_found" },
        ],
        reason: "goal met",
      },
    });

    const json = JSON.stringify(capability);
    expect(json).not.toContain("10001");
    expect(capability.description).toContain("[memberId]");
    expect(capability.steps.some((step) => step.action === "fill")).toBe(true);
    const fill = capability.steps.find((step) => step.action === "fill");
    expect(fill && "value" in fill && fill.value).toEqual({
      kind: "param",
      name: "memberId",
    });
    const click = capability.steps.find((step) => step.action === "click");
    expect(click?.on?.map((handler) => handler.then.type)).toEqual([
      "business_outcome",
      "recover",
    ]);
    expect(capability.steps.some((step) => step.id.includes("continue"))).toBe(
      false,
    );
  });

  it("normalizes bad extract names, drops duplicate cells, and rejects a money checkpoint", () => {
    const capability = compileCapability({
      entryPoint: "http://127.0.0.1:4173/",
      appFamily: "core-servicing",
      params: { memberId: "10001" },
      acts: [
        { action: "navigate" },
        {
          action: "fill",
          role: "textbox",
          name: "Member ID",
          value: "10001",
        },
        { action: "click", role: "button", name: "Search" },
        {
          action: "extract",
          rowText: "Savings",
          columnHeader: "Balance",
          output: "string",
        },
        {
          action: "extract",
          rowText: "Savings",
          columnHeader: "Balance",
          output: "1240.50",
          outputType: "money",
        },
      ],
      done: {
        type: "done",
        name: "Member savings balance lookup",
        description: "done",
        checkpointKind: "text",
        checkpointValue: "$1,240.50",
        reason: "goal met",
      },
    });

    expect(capability.outputs).toEqual([
      expect.objectContaining({ name: "savingsBalance", type: "money" }),
    ]);
    expect(
      capability.steps.filter((step) => step.action === "extract"),
    ).toHaveLength(1);
    expect(capability.success.checkpoint).toEqual({
      kind: "heading",
      value: "Member detail",
    });
    expect(
      capability.steps.find((step) => step.action === "click")?.on?.[0]?.then,
    ).toEqual({ type: "business_outcome", code: "member_not_found" });
  });
});
