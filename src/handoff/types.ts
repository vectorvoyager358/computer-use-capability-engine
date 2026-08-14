import type { Step } from "../schema/capability";
import type { RunSession } from "../session/session";
import type { Observation } from "../surface/surface";

export type ResumeDecision = "skip_step" | "retry_step" | "abort";

export type HumanAction = {
  type: "click" | "fill" | "select" | "dismiss" | "other";
  detail: string;
};

export type InterventionRequest = {
  capabilityId: string;
  step: Step;
  reason: string;
  observation: Observation;
  screenshotPath?: string;
};

export type HandoffOutcome = {
  actions: HumanAction[];
  resume: ResumeDecision;
};

export type Handoff = {
  intervene(
    session: RunSession,
    request: InterventionRequest,
  ): Promise<HandoffOutcome>;
};
