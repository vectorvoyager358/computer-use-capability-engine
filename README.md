# computer-use-capability-engine

LLM-driven computer-use system that discovers UI workflows, records them as reusable capabilities, and executes them through deterministic replay with safety guardrails and human-in-the-loop escalation.

## Status

The capability schema, local core-servicing app, deterministic replay, policy, and human handoff are in place. Discovery is not built yet.

## Setup

Requires Node 22.12+.

```bash
npm install
npx playwright install chromium
npm run check
```

Start the local target app (no API keys):

```bash
npm run app
```

It listens on `http://127.0.0.1:4173/`. Member `10001` has a savings balance; any other id returns "Member not found".

## Demo

Not available yet. This section will have the commands to discover a goal and replay the resulting capability.
