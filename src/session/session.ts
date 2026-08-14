import type { Surface } from "../surface/surface";

export type Owner = "automation" | "human";

/** Who may act on the live surface. Handoff flips this; it does not open a new session. */
export class RunSession {
  owner: Owner = "automation";

  constructor(readonly surface: Surface) {}

  cede() {
    this.owner = "human";
  }

  resume() {
    this.owner = "automation";
  }
}
