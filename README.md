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

`npm run app` is only if you want to click the UI in a browser. `discover` and `replay` start their own copy of the app; you do not need this running for the demo commands.

```bash
npm run app
```

It listens on `http://127.0.0.1:4173/`. Members `10001` (`$1,240.50`) and `10002` (`$50.00`) have savings balances; an unknown id returns "Member not found". A successful lookup shows a session warning; replay dismisses it and logs a `recovered` event.

## Demo

Discovery talks to NVIDIA NIM (`nvidia/nemotron-3.5-lightning-30b-a3b`) and writes a capability under `evidence/`. Replay does not call a model. Override the model with `NVIDIA_MODEL` in `.env` (must be a chat NIM with tool calling).

Recorded run (do not re-run `discover` into these paths unless you intend to replace it):

- `evidence/lookup-member-savings.json` — compiled capability (the contract)
- `evidence/discovery.json` — raw model log from that run
- `evidence/discovery.png` — screenshot at the end of discovery
- `evidence/replay-success.json` — replay for `10001` (`$1,240.50`, plus `recovered`)
- `evidence/replay-member-not-found.json` — replay for `99999`

```bash
npm run discover -- --goal "Look up the member savings balance" --param memberId=10001 --out evidence/lookup-member-savings.json
npm run replay -- --capability evidence/lookup-member-savings.json --param memberId=10001 --out evidence/replay-success.json
npm run replay -- --capability evidence/lookup-member-savings.json --param memberId=99999 --out evidence/replay-member-not-found.json
```

The same capability with `--param memberId=10002` returns `$50.00` (no second discovery). Human handoff is exercised in tests; the operator UI is mocked.

Without a key, `npm run check` still exercises discovery against the live app using a scripted model. To dry-run the CLI itself, write somewhere other than `evidence/`:

```bash
npm run discover -- --model scripted --param memberId=10001 --out /tmp/lookup-member-savings.json
```

`--model scripted` is a test double. Evidence meant to show a real discovery run must use the default NIM path.
