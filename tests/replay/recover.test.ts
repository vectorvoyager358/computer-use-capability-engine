import { describe, expect, it } from "vitest";
import { replay } from "../../src/replay/engine";
import { parseCapability } from "../../src/schema/capability";
import { LocatorError } from "../../src/surface/surface";
import { RecordingSurface } from "../helpers/recording-surface";

class SessionWarningSurface extends RecordingSurface {
  private warning = false;

  async click() {
    this.clicks += 1;
    this.warning = true;
  }

  async dismiss() {
    this.warning = false;
  }

  async observe() {
    if (this.warning) {
      return {
        url: this.gotos.at(-1) ?? "",
        text: "Your session is about to expire.",
        dialog: "Your session is about to expire.",
      };
    }
    return { url: this.gotos.at(-1) ?? "", text: "Member detail" };
  }

  async extract() {
    if (this.warning) {
      throw new LocatorError("Savings / Balance", "session warning");
    }
    return "$1,240.50";
  }

  async checkpointMet() {
    return !this.warning;
  }
}

const recoverHandler = {
  match: { kind: "dialog" as const, value: "Your session is about to expire." },
  // biome-ignore lint/suspicious/noThenProperty: handler verb in the artifact, not a thenable
  then: {
    type: "recover" as const,
    action: "dismiss" as const,
    target: {
      candidates: [
        { strategy: "role_name" as const, role: "button", name: "Continue" },
      ],
    },
  },
};

function capability(recover: boolean) {
  return parseCapability({
    schemaVersion: "1.0.0",
    id: "recover-probe",
    name: "Recover probe",
    description: "Search then extract after a session warning",
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
        description: "Balance after the warning is dismissed",
      },
    ],
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
        target: {
          candidates: [
            { strategy: "role_name", role: "button", name: "Search" },
          ],
        },
        risk: "read",
        on: recover ? [recoverHandler] : undefined,
      },
      {
        id: "extract-balance",
        action: "extract",
        target: {
          candidates: [
            {
              strategy: "table_cell",
              rowText: "Savings",
              columnHeader: "Balance",
            },
          ],
        },
        output: "savingsBalance",
        risk: "read",
      },
    ],
    success: {
      checkpoint: { kind: "text", value: "Member detail" },
      outputs: ["savingsBalance"],
    },
  });
}

describe("recoverable interstitial", () => {
  it("dismisses the warning, logs recovered, and still returns the output", async () => {
    const surface = new SessionWarningSurface();
    const result = await replay(capability(true), { surface });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.outputs.savingsBalance).toBe("$1,240.50");
    }
    expect(result.events.some((event) => event.type === "recovered")).toBe(
      true,
    );
  });

  it("fails extract when the warning is not recovered", async () => {
    const surface = new SessionWarningSurface();
    const result = await replay(capability(false), { surface });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.stepId).toBe("extract-balance");
    }
    expect(result.events.some((event) => event.type === "recovered")).toBe(
      false,
    );
  });
});
