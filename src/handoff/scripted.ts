import type { RunSession } from "../session/session";
import type { Handoff, HandoffOutcome, InterventionRequest } from "./types";

/** Test/mock operator: acts on the same session surface, then signals resume. */
export class ScriptedOperator implements Handoff {
  constructor(
    private readonly run: (
      session: RunSession,
      request: InterventionRequest,
    ) => Promise<HandoffOutcome> | HandoffOutcome,
  ) {}

  async intervene(session: RunSession, request: InterventionRequest) {
    if (session.owner !== "human") {
      throw new Error(
        "operator called while automation still owns the session",
      );
    }
    return this.run(session, request);
  }
}
