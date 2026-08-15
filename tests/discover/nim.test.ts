import { describe, expect, it } from "vitest";
import { parseChatDecision } from "../../src/discover/nim";

describe("parseChatDecision", () => {
  it("reads a tool call as the decision", () => {
    const decision = parseChatDecision({
      choices: [
        {
          message: {
            tool_calls: [
              {
                function: {
                  name: "click",
                  arguments: JSON.stringify({
                    role: "button",
                    name: "Search",
                    reason: "submit the inquiry",
                  }),
                },
              },
            ],
          },
        },
      ],
    });
    expect(decision).toEqual({
      type: "click",
      role: "button",
      name: "Search",
      reason: "submit the inquiry",
    });
  });

  it("falls back to JSON content when no tool call is present", () => {
    const decision = parseChatDecision({
      choices: [
        {
          message: {
            content:
              '```json\n{"type":"give_up","reason":"no safe control"}\n```',
          },
        },
      ],
    });
    expect(decision.type).toBe("give_up");
  });
});
