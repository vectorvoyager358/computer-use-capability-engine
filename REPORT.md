# REPORT

## Architecture

Single process, TypeScript, CLI. Discovery and replay share one `Surface` (today `PlaywrightWebSurface`) and the same policy gate. The LLM is a recording engineer, not the production executor.

```
goal + entry URL
        │
        ▼
   discover()  ──observe a11y inventory──►  NVIDIA NIM (one tool call / turn)
        │                                    fill | click | extract | done
        ▼
   compile()   ──parameterize, scrub, normalize──►  capability JSON
        │
        ▼
   replay()    ──no model──►  success | business_outcome | escalated | failed
                    │
                    └── stuck / irreversible ──►  HITL on the same RunSession
```

Zod validates the capability at the boundary. Playwright maps intents onto a live page. Policy runs **before** every act. `npm run check` (typecheck, lint, test) does not need an API key; CI uses a `ScriptedModel`. A genuine discovery run used `nvidia/nemotron-3.5-lightning-30b-a3b` via OpenAI-compatible `/chat/completions` (`fetch`, no extra SDK).

Rejected: queues, a capability catalog service, Python/Pydantic (one language for schema, replay, and the browser adapter). Rejected saving the model transcript as the artifact.

The target is a local server-rendered core-servicing mock (`apps/core-servicing`, port 4173): nested layout tables, ids `f1`/`cmd1`, no test IDs. Search → member detail. Known members: `10001` savings `$1,240.50`, `10002` savings `$50.00`. An unknown id (`99999` in evidence) returns “Member not found”. A successful lookup also shows a session-expiring dialog; the balance table stays hidden until Continue. Rejected a public cart demo (ToS, no controlled not-found). Rejected framesets in v1 (replay would need frame targeting before the first replay worked).

## Artifact schema

The file a calling agent invokes is `schemaVersion` 1.0.0 JSON (`src/schema/capability.ts`). `schemaVersion` is the format; `revision` is this flow. `strictObject` so a reviewed file cannot silently drop fields.

A capability is a **contract**: typed `parameters` and `outputs` with sensitivity; ordered `steps`; a success `checkpoint`. Values are refs (`param` / `literal` / `entry`), never a discovery-time member number. Fill is `{ kind: "param", name: "memberId" }`, not `"10001"`.

Steps are a discriminated union on `action`. Invalid combos (fill without a value, extract without an output) fail at parse time. Each step has `risk`: `read` | `reversible` | `irreversible`.

Locators are an ordered candidate list, biased to a surface with no clean DOM: `role_name` → `label` → `nearby_text` → `table_cell` → `structural` → `css`. CSS is last-resort. Test IDs are not a strategy. `table_cell` is row text plus column header, not a CSS nth-child.

`on` clauses on steps declare what replay should do when the page matches: `business_outcome`, `recover`, `escalate`, or `fail`. Replay does not invent that taxonomy at runtime.

The compiler (`src/discover/compile.ts`) is the seam between a noisy model run and that contract. A live Nemotron session extracted the same Savings cell under names `string` and `1240.50`, used `$1,240.50` as a checkpoint, and put a member id in the description. Compile scrubs param values, dedupes table cells, renames invalid outputs to `savingsBalance`, defaults `member_not_found` on Search, and replaces a money-amount checkpoint with heading `Member detail`. `evidence/discovery.json` is the raw log; `evidence/lookup-member-savings.json` is what production keeps.

## Determinism & error handling

Replay walks the artifact with no LLM. For each step it tries locators in rank order, then evaluates `on` against the observed page. Fill events log `param.memberId`, not the value.

Nested layout tables made a naive `table tr` extract return the whole page; the adapter targets **direct rows only** (`:scope > tbody > tr`). That is a replay bug, not “the UI drifted.”

Terminal statuses: `success` | `business_outcome` | `escalated` | `failed`.

- **`business_outcome`** is a legitimate caller result (`member_not_found`), not a crash. Evidence: `evidence/replay-member-not-found.json`.
- **`recovered`** is an **event**, not a status. After Search, the mock shows a session-expiring dialog and hides the balance table. Replay matches `on` → `recover` → dismisses Continue, logs `recovered`, then extracts. If dismiss works, the caller still gets success (or a business outcome). Evidence: `evidence/replay-success.json` includes that event.
- **`failed`** always includes `stepId`, `expected`, `observed`, and optionally a screenshot. Unknown UI (locator miss with no handoff, failed checkpoint) stops here. Replay does not call the model to improvise.
- **`escalated`** is control transfer (irreversible step, locator miss with a handoff that aborts, or an `on` → escalate), not “we are stuck internally.”

Happy-path evidence: `evidence/replay-success.json` (`savingsBalance: "$1,240.50"`). The same artifact with `memberId=10002` returns `$50.00` — parameterization, not a second recording. Locator miss without a handoff: broken Search name → `failed` on `click-search` with expected/observed. With a handoff, the same miss cedes the live page; the operator clicks Search and replay still extracts `$1,240.50`.

## Heterogeneity & multi-tenant

**Surface.** The artifact stores intents (`click`, `fill`, `extract`) and locator *candidates*, not Playwright selectors. `Surface` is how we perceive and act (goto, click, fill, extract, a11y `inventory`, observe). Today one implementation: Chromium. A desktop adapter would implement the same type and resolve `role_name` against the OS accessibility tree; `table_cell` would mean “row/column in the focused grid.” CSS candidates would no-op or be ignored. The replay engine would not change.

Framesets, extra document contexts, and screenshot+coordinates are the next surface problems, not schema problems. Coordinates were rejected as the default locator: they fail under DPI and layout shift; role+name matches how a human finds the control.

**Tenants.** The base artifact has `app.family` + `surface`, **no `tenantId`**. Hundreds of credit unions on the same vendor product should share one capability. Drift belongs in an overlay later: per-tenant locator inserts (an extra `label` candidate), copy variants for `on` match strings, entry URL. Detection: replay `failed` with the same `stepId` and a changed `observed` across tenants is a locator/copy drift signal, not a reason to re-record the whole flow. Re-record when the *intent* changed (a new confirmation step), not when a button’s accessible name gained a suffix.

## Escalation & handoff

Stuck means: policy refuses an irreversible act, an `on` handler says escalate, a locator miss when a handoff is present, or discovery `give_up` / max steps. Locator-miss with no handoff stays `failed`. With a handoff, the same session is ceded **once per step**; a second miss on that step fails instead of looping.

`RunSession` owns the live `Surface` and `owner: automation | human`. Handoff is `cede` → `intervene` → `resume` on that object. A new browser is not a handoff.

The intervention carries capability/goal, current step, page text, optional screenshot, and why it stopped. The operator acts on `session.surface`. Resume is `skip_step` (human finished the blocked step — correct after an irreversible click), `retry_step`, or `abort`. Human work is `events[].type === "human"`.

Operator UI is mocked: `ScriptedOperator` in tests (Playwright runs for irreversible Search and for a broken Search locator; the operator clicks the real Search on the **same** page and replay extracts `$1,240.50`); `PromptOperator` is headed browser plus stdin `skip|retry|abort`. A co-browsing console would subscribe to the same `Handoff` interface.

## Safety

Policy (`src/policy`) runs before the surface moves: allowlisted action types, host, path prefix. Default allowlist is `127.0.0.1` / `localhost`. Irreversible defaults to **escalate and do not click**; `onIrreversible: "block"` is the stricter option. Discovery is bound by the same gate.

Artifacts and logs must not persist secrets or raw identifiers. Param values with sensitivity `identifier` / `financial` / `secret` / `full_pii` are stripped from failure `observed` (`[memberId]`, not `10001`). Success **outputs** stay intact — that is the capability contract (the caller asked for the balance). Screenshots are not pixel-redacted (cut). Discovery prompts redact inventory values the same way so the model sees “filled” without a raw member number in our logs.

## Cuts

- **Operator UI** — mock; control transfer is real.
- **Desktop / framesets / multi-tenant overlays** — designed, not built.
- **Screenshot redaction, capability catalog API, codegen, N-run flakiness, bounded LLM fallback on replay** — stretch; skipped until this thread was evidenced.
- **CI model** — `ScriptedModel`. The NIM path is real; CI does not call it.

Next, if this were production: a tenant overlay for copy/locator drift.
