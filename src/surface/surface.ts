import type { Checkpoint, LocatorSet } from "../schema/capability";

export type Observation = {
  url: string;
  text: string;
  dialog?: string;
};

export type Surface = {
  goto(url: string): Promise<void>;
  click(target: LocatorSet): Promise<void>;
  fill(target: LocatorSet, value: string): Promise<void>;
  select(target: LocatorSet, value: string): Promise<void>;
  extract(target: LocatorSet): Promise<string>;
  dismiss(target: LocatorSet): Promise<void>;
  observe(): Promise<Observation>;
  checkpointMet(checkpoint: Checkpoint): Promise<boolean>;
  screenshot(path: string): Promise<void>;
  close(): Promise<void>;
};

export class LocatorError extends Error {
  constructor(
    readonly expected: string,
    readonly observed: string,
  ) {
    super(`locator miss: expected ${expected}; observed ${observed}`);
    this.name = "LocatorError";
  }
}

export function describeTarget(target: LocatorSet): string {
  return target.candidates
    .map((candidate) => {
      switch (candidate.strategy) {
        case "role_name":
          return `${candidate.role} "${candidate.name}"`;
        case "label":
          return `label "${candidate.label}"`;
        case "nearby_text":
          return `near "${candidate.text}"`;
        case "table_cell":
          return `table[${candidate.rowText} / ${candidate.columnHeader}]`;
        case "structural":
          return candidate.path;
        case "css":
          return candidate.selector;
        default: {
          const _exhaustive: never = candidate;
          return _exhaustive;
        }
      }
    })
    .join(" | ");
}
