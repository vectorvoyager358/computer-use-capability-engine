# computer-use-capability-engine

LLM-driven computer-use system that discovers UI workflows, records them as reusable capabilities, and executes them through deterministic replay with safety guardrails and human-in-the-loop escalation.

## Status

Discovery, deterministic replay, policy, and human handoff are in place. A live model call is required only for discovery.

## Setup

Requires Node 22.12+.

```bash
npm install
npx playwright install chromium
cp .env.example .env
npm run check
```

Add NVIDIA API key in `.env` as `NVIDIA_API_KEY` to run discovery. Create a key at [https://build.nvidia.com/models](https://build.nvidia.com/models). 
Replay and `npm run check` do not need a key.

Start the local target app (no API keys):

```bash
npm run app
```

It listens on `http://127.0.0.1:4173/`. Member `10001` has a savings balance; any other id returns "Member not found".

## Demo

Discovery talks to NVIDIA NIM (`nvidia/nemotron-3.5-lightning-30b-a3b`) and writes a capability under `evidence/`. Replay does not call a model. Override the model with `NVIDIA_MODEL` in `.env` (must be a chat NIM with tool calling).

```bash
npm run discover -- --goal "Look up the member savings balance" --param memberId=10001 --out evidence/lookup-member-savings.json
npm run replay -- --capability evidence/lookup-member-savings.json --param memberId=10001 --out evidence/replay-success.json
npm run replay -- --capability evidence/lookup-member-savings.json --param memberId=99999 --out evidence/replay-member-not-found.json
```

Without a key, `npm run check` still exercises discovery against the live app using a scripted model. To dry-run the CLI itself:

```bash
npm run discover -- --model scripted --param memberId=10001 --out evidence/lookup-member-savings.json
```

`--model scripted` is a test double. Evidence meant to show a real discovery run must use the default NIM path.
