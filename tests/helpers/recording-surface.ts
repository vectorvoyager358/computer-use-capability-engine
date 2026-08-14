import type { Checkpoint, LocatorSet } from "../../src/schema/capability";
import type { Observation, Surface } from "../../src/surface/surface";

export class RecordingSurface implements Surface {
  readonly gotos: string[] = [];
  clicks = 0;

  async goto(url: string) {
    this.gotos.push(url);
  }

  async click(_target: LocatorSet) {
    this.clicks += 1;
  }

  async fill(_target: LocatorSet, _value: string) {}

  async select(_target: LocatorSet, _value: string) {}

  async extract(_target: LocatorSet) {
    return "";
  }

  async dismiss(_target: LocatorSet) {}

  async observe(): Promise<Observation> {
    return { url: this.gotos.at(-1) ?? "", text: "" };
  }

  async checkpointMet(_checkpoint: Checkpoint) {
    return true;
  }

  async screenshot(_path: string) {}

  async close() {}
}
