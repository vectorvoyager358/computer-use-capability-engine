import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createServer } from "../apps/core-servicing/server";
import { discover } from "./discover/loop";
import { NvidiaNimModel } from "./discover/nim";
import { lookupMemberScript, ScriptedModel } from "./discover/scripted";
import { replay } from "./replay/engine";
import { parseCapability } from "./schema/capability";
import { PlaywrightWebSurface } from "./surface/playwright-web";

const CANONICAL = "http://127.0.0.1:4173/";

await loadEnv();

const command = process.argv[2];
if (command === "discover") {
  await runDiscover();
} else if (command === "replay") {
  await runReplay();
} else {
  process.stderr.write("usage: node src/cli.ts discover|replay\n");
  process.exitCode = 1;
}

async function runDiscover() {
  const goal =
    flag("goal") ?? "Look up the member savings balance and return it.";
  const out = flag("out") ?? "evidence/lookup-member-savings.json";
  const params = parseParams();
  const modelName = flag("model") ?? "nim";
  const model =
    modelName === "scripted"
      ? new ScriptedModel(lookupMemberScript(params.memberId ?? "10001"))
      : nimModel();

  const { baseUrl, close } = await startApp();
  const surface = await PlaywrightWebSurface.launch();
  try {
    const result = await discover({
      goal,
      entryPoint: `${baseUrl}/`,
      artifactEntryPoint: CANONICAL,
      surface,
      model,
      params,
      evidenceDir: dirname(out),
    });
    await mkdir(dirname(out), { recursive: true });
    await writeFile(
      join(dirname(out), "discovery.json"),
      `${JSON.stringify(result.log, null, 2)}\n`,
    );
    if (result.status !== "success") {
      process.stderr.write(`${result.status}: ${result.reason}\n`);
      process.exitCode = 1;
      return;
    }
    await writeFile(out, `${JSON.stringify(result.capability, null, 2)}\n`);
    process.stdout.write(`wrote ${out}\n`);
  } finally {
    await surface.close();
    await close();
  }
}

async function runReplay() {
  const path = flag("capability") ?? "evidence/lookup-member-savings.json";
  const out = flag("out");
  const params = parseParams();
  const capability = parseCapability(JSON.parse(await readFile(path, "utf8")));
  const { baseUrl, close } = await startApp();
  const surface = await PlaywrightWebSurface.launch();
  try {
    const result = await replay(capability, {
      surface,
      entryPoint: `${baseUrl}/`,
      params,
      evidenceDir: out ? dirname(out) : undefined,
    });
    const json = `${JSON.stringify(result, null, 2)}\n`;
    if (out) {
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, json);
      process.stdout.write(`wrote ${out}\n`);
    } else {
      process.stdout.write(json);
    }
    if (result.status === "failed") process.exitCode = 1;
  } finally {
    await surface.close();
    await close();
  }
}

function nimModel() {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error(
      "NVIDIA_API_KEY is required for discover (or pass --model scripted)",
    );
  }
  return new NvidiaNimModel(key);
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function parseParams(): Record<string, string> {
  const params: Record<string, string> = {};
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] !== "--param") continue;
    const raw = process.argv[i + 1];
    if (!raw) continue;
    const eq = raw.indexOf("=");
    if (eq < 0) continue;
    params[raw.slice(0, eq)] = raw.slice(eq + 1);
  }
  if (!params.memberId) params.memberId = "10001";
  return params;
}

async function startApp() {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected a TCP address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function loadEnv() {
  try {
    const text = await readFile(".env", "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq);
      let value = trimmed.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // no .env is fine
  }
}
