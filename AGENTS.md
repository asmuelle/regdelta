# AGENTS.md — Operating Manual for AI Agents

## Project snapshot

**RegDelta** is a citation-pinned, living obligation map for SME compliance teams: a deterministic pipeline watches government primary sources daily, diffs them, and maintains topic-scoped articles where every obligation node carries pinned source text, an effective date, and full version history. The deliverable is the examiner-facing audit trail, not alerts.

- **Who pays:** compliance officers / ops leads running 1-3 person compliance functions at SME fintechs, lenders, healthtech, crypto custodians, and fractional-compliance firms. Pricing $599-1,500/mo (no cheap tier — see DESIGN.md M3).
- **Status:** Tier 1 research candidate (survived adversarial review, verdict "weakened"). M0 (workspace bootstrap) and the M1 vertical slice are implemented: deterministic ingest → diff → triage → synthesis → gate against checked-in CFPB/eCFR fixtures, model ports mocked (no AI API), slice rendered read-only in `apps/web`. A live Anthropic adapter now exists behind the same ports (`packages/pipeline/src/anthropic`, fetch-based, structured tool output, zod-validated; citation offsets pinned deterministically, entailment fails closed) but is used ONLY by the live eval — `just ci` stays offline/deterministic on mocks. Real recall/precision is measured via `just eval-live` (needs `ANTHROPIC_API_KEY`); the same corpora run against mocks in CI as a wiring baseline. Postgres persistence is wired (`packages/db`: postgres.js client + Drizzle, an `EventRepository`, and migration `0001` whose append-only trigger is proven by a live-DB integration test — `integration.int.test.ts`, skipped unless `DATABASE_URL` is set, run in CI against the Postgres service). Projection persistence is wired (`persistPipelineRun` + read repos), as is the human-decision write path (`recordReviewDecision` appends a hash-chained `human_decision` event — approve/reject — onto the persisted log, proven by a live-DB test) and Inngest scheduling (a `daily-crawl-and-persist` cron function served at `/api/inngest` that runs the pipeline → persists, no-op without `DATABASE_URL`; schema migrations are a deploy step, never bundled into the web runtime). The runtime DB-backed interactive UI is wired: the page is `force-dynamic`, reads/seeds the persisted log when `DATABASE_URL` is set (degrading to the in-process run, read-only, otherwise), and approve/reject post to a `submitDecision` server action calling `recordReviewDecision`. M3 has started: a live Federal Register adapter (`packages/pipeline/src/adapters/federalRegister.ts`) fetches the newest CFPB document + raw text behind an injectable `HttpClient` seam (zod-validated, offline-tested with canned responses; real network only on the live crawl path, never in CI). Still M3-pending: wiring live adapters into the scheduled crawl, an eCFR live adapter (XML), reviewer auth (the decision actor is a placeholder), alert delivery (Slack/email), and Stripe billing.

## Read first

1. `README.md` — research dossier: market evidence, adversarial review, recommended stack. Do not contradict it.
2. `DESIGN.md` — architecture, data model, flows, milestones (M0-M3), risks. The build order lives here.
3. `TOOLS.md` — every command, external API, env var, and local service.

## Commands (single source of truth)

Always use `just` recipes — never raw `pnpm`/`docker` invocations — so behavior matches CI.

| Recipe                        | Purpose                                           |
| ----------------------------- | ------------------------------------------------- |
| `just`                        | List recipes                                      |
| `just setup`                  | corepack enable + pnpm install                    |
| `just dev`                    | Run dev servers (`pnpm dev`)                      |
| `just db-up` / `just db-down` | Start/stop local Postgres + pgvector              |
| `just migrate`                | Apply Drizzle migrations                          |
| `just test`                   | Unit tests (vitest)                               |
| `just e2e`                    | Playwright e2e                                    |
| `just lint` / `just format`   | ESLint / Prettier                                 |
| `just typecheck`              | tsc --noEmit across workspace                     |
| `just build`                  | Production build                                  |
| `just ci`                     | lint + typecheck + test + build (must stay green) |

Until M0 lands, code recipes fail fast with a "not bootstrapped" message. That is expected.

## Architecture summary

A deterministic ingestion pipeline (crawl → snapshot → content-hash/structural diff) feeds a cheap-model triage (Haiku vs. company-profile embeddings), then frontier synthesis (Sonnet change cards with offset-anchored quote pins), then an entailment + validator gate that blocks any publish that is not byte-verifiable against stored snapshots; everything lands in an append-only, hash-chained event log projected into the obligation map UI and examiner exports. Scheduling is Inngest (rationale in DESIGN.md).

| Module              | Role                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js 15 App Router UI: obligation map, change cards, review queue, coverage health, exports |
| `packages/core`     | Pure TS domain logic: reducers, validators, gate policy, export formatting (no I/O)            |
| `packages/pipeline` | Adapters, diff engine, triage, synthesis, entailment, alerts (Inngest functions)               |
| `packages/db`       | Drizzle schema + migrations, Postgres 16 + pgvector                                            |

## Workflow

1. **Follow milestone order.** Work M0 → M1 → M2 → M3 (DESIGN.md). Do not start trust-layer or billing work while the current milestone's acceptance criteria are unmet, and do not widen scope (new jurisdictions, new verticals) inside a milestone.
2. **Plan before multi-file work** (planner agent for anything touching more than one package).
3. **TDD always** (tdd-guide agent): the gate, diff, and reducer logic in `packages/core` is exactly the kind of code where the test is the spec.
4. **Review after writing** (code-reviewer agent); anything touching the event log, exports, auth, or customer profile data also gets security-reviewer.
5. **Keep `just ci` green** — it is the same gate CI runs; never merge red.
6. **Update the docs you invalidate.** New env var → TOOLS.md; new module or flow → DESIGN.md; new invariant implication → this file.

## Coding standards

- TypeScript strict mode everywhere; no `any` without a justifying comment.
- Files <800 lines, functions <50 lines; split by feature, not by type.
- Immutability by default: reducers return new state; pipeline stages produce new records, never mutate prior ones.
- Explicit error handling at every boundary (adapter fetch, model call, DB write, export). Never swallow errors — a swallowed crawl error is a coverage gap (Invariant 5).
- No hardcoded secrets or URLs-with-keys; env vars only, validated at startup.
- Conventional commits: `feat/fix/refactor/docs/test/chore`.

## Testing policy

- TDD: write the failing test first (RED → GREEN → IMPROVE). Coverage target 80%+; `packages/core` should approach 100%.
- AAA pattern (Arrange-Act-Assert), descriptive behavior names.
- What matters most **for this product**, in order:
  1. **Gate tests** — corrupted citations, mismatched dates, non-entailed claims must be blocked from publishing. These are the product's safety case.
  2. **Diff determinism** — same source pair → identical delta, every time; no flaky normalization.
  3. **Event-log integrity** — hash chain verifies; replays/projections are pure; exports reproduce byte-stable.
  4. **Adapter fixtures** — recorded real responses (Federal Register, eCFR) replayed offline; never hit live APIs in unit tests.
  5. **Omission traps** — eval corpus cases where a material change must NOT be triaged away (see Invariant 2).
- Playwright e2e for: change card render with resolving citations, review-queue approve/reject, export download.

## PRODUCT INVARIANTS (non-negotiable)

Violating any of these is a blocking defect, regardless of who asked for the change.

1. **No publish without provenance.** Every published obligation node and change card carries: pinned quote (snapshotId + char offsets), source URL, snapshot content hash, effective date (or explicit `none_stated`), version history. Schema and validators must make a provenance-free publish unrepresentable. _Test: constructing a card missing any field fails validation._
2. **The entailment gate fronts every publish.** No LLM-generated text reaches a customer surface without (a) NLI entailment pass and (b) deterministic validators: quoted spans byte-identical to the snapshot, dates parse, citations resolve, decision-support phrasing (no legal conclusions), and `requiredAction` is advisory (a confirm-applicability hedge, no customer-directed imperative — entailment cannot verify "what you must do", so a directive action is human-gated via the `action_advisory` check). There is no bypass flag — failures go to the review queue. _Test: a card with one altered character in a quoted span is blocked; a directive `requiredAction` with no forbidden phrase still routes to review._
3. **LLMs never detect change.** Change detection is content-hash + structural diff only. Models may classify/triage and synthesize, never decide whether a source changed, and never write to snapshot or event tables directly. The cheap classification stage must SEE every in-jurisdiction delta (`selectClassificationQueue`); embeddings may only _rank_ that queue (`applyEmbeddingRanking`), never filter it — an embedding cut is a learned false-negative source. _Test: pipeline produces identical deltas with model calls stubbed out; a low/absent embedding score never drops a delta from the queue._
4. **Append-only audit log.** Event tables accept INSERT only (enforced via DB grants/triggers, not convention); corrections are new events; the hash chain must verify end-to-end. _Test: UPDATE/DELETE against event tables fails at the database._
5. **Silence never means "no changes."** Every source has a freshness SLA; crawl failure or staleness raises an ops alert and customer-visible degradation. Never render a jurisdiction/source as covered unless it is actively and successfully crawled. Beyond liveness, source-set **completeness** is measured: a subscribed topic whose `expectedAuthorities` have no monitored source is surfaced as a blind spot (`assessCoverageCompleteness`), never silently treated as covered. _Test: simulated 3-day crawl outage flips coverage health and banners affected articles; a subscribed authority with no monitored source is reported as a blind spot._
6. **Decision support, not legal judgment.** Applicability output always ships with confidence, rationale, and review status; UI/exports never state legal conclusions ("you must" → "the rule text requires; confirm applicability"). A model can never auto-dismiss a delta for a customer — only a logged human action can. _Test: no code path sets `not_applicable` with a non-human actor._
7. **High-materiality cards require human approval** before alerting (year-1 rule). Auto-publish scope may expand only via the documented eval-corpus criterion in DESIGN.md M2. _Test: high-materiality card without an approval event cannot dispatch an alert._
8. **Crawl only what we may crawl.** Every Source records its `tosBasis`. Lexis/Westlaw-hosted state codes are `unsupported` — never scraped, never silently degraded; disclosed at onboarding. _Test: adapter registry rejects a Source without a tosBasis._
9. **Exports are reproducible.** Same event range → identical content checksum (excluding generation timestamp). The checksum prints on the artifact. _Test: double export, equal checksums._

## Definition of done

- [ ] Failing test written first; now green; coverage ≥80% on touched code
- [ ] `just ci` passes locally
- [ ] No invariant above weakened (check each one against your diff)
- [ ] Errors handled explicitly at every new boundary; no secrets in code
- [ ] Events emitted for any new state change (audit log completeness)
- [ ] DESIGN.md / TOOLS.md updated if architecture, commands, or env vars changed
- [ ] Conventional commit message; code-reviewer pass on the diff (security-reviewer if it touches events, exports, or customer profile data)
