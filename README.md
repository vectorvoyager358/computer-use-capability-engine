# computer-use-capability-engine

LLM-driven computer-use system that discovers UI workflows, records them as reusable capabilities, and executes them through deterministic replay with safety guardrails and human-in-the-loop escalation.

## Status

The capability schema and replay result contract are in place. Discovery, replay, the target app, and human handoff are not built yet.

## Setup

Requires Node 22.12+.

```bash
npm install
npm test
npm run typecheck
```

No API keys needed for the current code.

## Demo

Not available yet. This section will have the commands to discover a goal and replay the resulting capability.
