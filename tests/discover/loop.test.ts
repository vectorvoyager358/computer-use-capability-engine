import { afterEach, describe, expect, it } from "vitest";
import { discover } from "../../src/discover/loop";
import { lookupMemberScript, ScriptedModel } from "../../src/discover/scripted";
import { replay } from "../../src/replay/engine";
import { PlaywrightWebSurface } from "../../src/surface/playwright-web";
import { startApp } from "../helpers/http-app";

const apps: Array<{ close: () => Promise<void> }> = [];
const surfaces: PlaywrightWebSurface[] = [];

afterEach(async () => {
  await Promise.all(surfaces.splice(0).map((surface) => surface.close()));
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("discover lookup-member-savings", () => {
  it("compiles a live run into a capability that replays without a model", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);

    const discovered = await discover({
      goal: "Look up the member savings balance and return it.",
      entryPoint: `${app.baseUrl}/`,
      artifactEntryPoint: "http://127.0.0.1:4173/",
      surface,
      model: new ScriptedModel(lookupMemberScript("10001")),
      params: { memberId: "10001" },
    });

    expect(discovered.status).toBe("success");
    if (discovered.status !== "success") return;
    expect(JSON.stringify(discovered.capability)).not.toContain("10001");
    expect(discovered.log.model).toBe("scripted");

    await surface.goto("about:blank");
    const replayed = await replay(discovered.capability, {
      surface,
      entryPoint: `${app.baseUrl}/`,
      params: { memberId: "10001" },
    });

    expect(replayed.status).toBe("success");
    if (replayed.status === "success") {
      expect(replayed.outputs.savingsBalance).toBe("$1,240.50");
    }
  }, 30_000);

  it("escalates when the model gives up and there is no handoff", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);

    const result = await discover({
      goal: "Do something impossible",
      entryPoint: `${app.baseUrl}/`,
      surface,
      model: new ScriptedModel([
        { type: "give_up", reason: "cannot find a safe path" },
      ]),
    });

    expect(result.status).toBe("escalated");
    if (result.status === "escalated") {
      expect(result.reason).toContain("cannot find a safe path");
    }
  }, 30_000);

  it("lists Member ID and Search from the accessibility tree", async () => {
    const app = await startApp();
    apps.push(app);
    const surface = await PlaywrightWebSurface.launch();
    surfaces.push(surface);
    await surface.goto(`${app.baseUrl}/`);
    const inventory = await surface.inventory();
    expect(inventory).toContainEqual({ role: "textbox", name: "Member ID" });
    expect(inventory).toContainEqual({ role: "button", name: "Search" });

    await surface.fill(
      {
        candidates: [
          { strategy: "role_name", role: "textbox", name: "Member ID" },
        ],
      },
      "10001",
    );
    expect(await surface.inventory()).toContainEqual({
      role: "textbox",
      name: "Member ID",
      value: "10001",
    });
  }, 30_000);
});
