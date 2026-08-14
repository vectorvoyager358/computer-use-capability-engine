import { createInterface } from "node:readline/promises";
import type { RunSession } from "../session/session";
import type { Handoff, HandoffOutcome, InterventionRequest } from "./types";

/**
 * Bare operator surface: the headed browser is the console.
 * Prints the intervention and waits for skip | retry | abort on stdin.
 */
export class PromptOperator implements Handoff {
  async intervene(
    session: RunSession,
    request: InterventionRequest,
  ): Promise<HandoffOutcome> {
    if (session.owner !== "human") {
      throw new Error(
        "operator called while automation still owns the session",
      );
    }
    process.stdout.write(
      [
        "HITL: automation paused; use the live browser window.",
        `capability=${request.capabilityId} step=${request.step.id}`,
        `reason=${request.reason}`,
        request.screenshotPath ? `screenshot=${request.screenshotPath}` : "",
        "Type skip (human finished the step), retry, or abort, then Enter.",
        "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const line = (await rl.question("> ")).trim().toLowerCase();
      if (line === "retry") {
        return {
          actions: [{ type: "other", detail: "stdin:retry" }],
          resume: "retry_step",
        };
      }
      if (line === "abort") {
        return {
          actions: [{ type: "other", detail: "stdin:abort" }],
          resume: "abort",
        };
      }
      return {
        actions: [{ type: "other", detail: `stdin:${line || "skip"}` }],
        resume: "skip_step",
      };
    } finally {
      rl.close();
    }
  }
}
