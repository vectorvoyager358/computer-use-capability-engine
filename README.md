# computer-use-capability-engine

LLM-driven computer-use system that discovers UI workflows, records them as reusable capabilities, and executes them through deterministic replay with safety guardrails and human-in-the-loop escalation.

## Status

The capability schema, replay result contract, and a local core-servicing target app are in place. Discovery, replay, and human handoff are not built yet.

## Setup

Requires Node 22.12+.

```bash
npm install
npm run check
```

Start the local target app (no API keys):

```bash
npm run app
```

It listens on `http://127.0.0.1:4173/`. Member `10001` has a savings balance; any other id returns "Member not found".

## Demo

Not available yet. This section will have the commands to discover a goal and replay the resulting capability.
