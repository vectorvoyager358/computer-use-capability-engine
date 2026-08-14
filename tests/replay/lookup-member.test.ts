import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { ScriptedOperator } from "../../src/handoff/scripted";
import { replay } from "../../src/replay/engine";
import { parseCapability } from "../../src/schema/capability";
import { RunSession } from "../../src/session/session";
import { PlaywrightWebSurface } from "../../src/surface/playwright-web";
import { startApp } from "../helpers/http-app";

const fixture = parseCapability(
  JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../fixtures/lookup-member-savings.json",
      ),
      "utf8",
    ),
  ),
);

const apps: Array<{ close: () => Promise<void> }> = [];
const surfaces: PlaywrightWebSurface[] = [];

afterEach(async () => {
  await Promise.all(surfaces.splice(0).map((surface) => surface.close()));
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("replay lookup-member-savings", () => {
  it("returns savings balance for member 10001 without calling an LLM", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);

    const result = await replay(fixture, {
      surface,
      entryPoint: `${app.baseUrl}/`,
      params: { memberId: "10001" },
    });

    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.outputs.savingsBalance).toBe("$1,240.50");
    }
  }, 30_000);

  it("returns member_not_found as a business outcome, not a failure", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);

    const result = await replay(fixture, {
      surface,
      entryPoint: `${app.baseUrl}/`,
      params: { memberId: "99999" },
    });

    expect(result.status).toBe("business_outcome");
    if (result.status === "business_outcome") {
      expect(result.code).toBe("member_not_found");
    }
  }, 30_000);

  it("fails with step, expected, and observed when a locator misses", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);

    const broken = parseCapability({
      ...fixture,
      steps: fixture.steps.map((step) =>
        step.id === "click-search"
          ? {
              ...step,
              target: {
                candidates: [
                  {
                    strategy: "role_name",
                    role: "button",
                    name: "Definitely not a button",
                  },
                ],
              },
            }
          : step,
      ),
    });

    const result = await replay(broken, {
      surface,
      entryPoint: `${app.baseUrl}/`,
      params: { memberId: "10001" },
    });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.stepId).toBe("click-search");
      expect(result.expected).toContain("Definitely not a button");
      expect(result.observed.length).toBeGreaterThan(0);
    }
  }, 30_000);

  it("hands the live page to a human for an irreversible search, then resumes", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);
    const session = new RunSession(surface);

    const irreversibleSearch = parseCapability({
      ...fixture,
      steps: fixture.steps.map((step) =>
        step.id === "click-search" ? { ...step, risk: "irreversible" } : step,
      ),
    });

    const result = await replay(irreversibleSearch, {
      surface,
      session,
      entryPoint: `${app.baseUrl}/`,
      params: { memberId: "10001" },
      handoff: new ScriptedOperator(async (owned, request) => {
        expect(owned.owner).toBe("human");
        expect(owned.surface).toBe(surface);
        if (request.step.action !== "click") {
          throw new Error("expected click step");
        }
        await owned.surface.click(request.step.target);
        return {
          actions: [
            { type: "click", detail: "clicked Search on live session" },
          ],
          resume: "skip_step",
        };
      }),
    });

    expect(result.status).toBe("success");
    expect(session.owner).toBe("automation");
    if (result.status === "success") {
      expect(result.outputs.savingsBalance).toBe("$1,240.50");
    }
    expect(result.events.some((event) => event.type === "human")).toBe(true);
  }, 30_000);
});
