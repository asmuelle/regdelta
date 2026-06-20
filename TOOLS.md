# TOOLS.md — Commands, APIs, Env, CI

## just recipes

| Recipe           | What it does                                                                          | When to run                                                   |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `just`           | Lists all recipes                                                                     | Orientation                                                   |
| `just setup`     | `corepack enable` + `pnpm install`                                                    | After clone, after lockfile changes                           |
| `just dev`       | `pnpm dev` — Next.js app + Inngest dev server (once wired)                            | Daily development                                             |
| `just db-up`     | `docker compose up -d postgres` (pgvector/pgvector:pg16)                              | Before migrate/test/dev                                       |
| `just db-down`   | Stops the Postgres container                                                          | Cleanup                                                       |
| `just migrate`   | Drizzle migrations via `packages/db`                                                  | After pulling schema changes; after editing schema            |
| `just test`      | `pnpm test` — vitest across the workspace                                             | Constantly (TDD)                                              |
| `just eval`      | `pnpm eval` — eval gate only (materiality + classifier/entailment baselines vs mocks) | Tuning prompts/thresholds; also runs inside `test`            |
| `just eval-live` | `pnpm eval:live` — LIVE eval against the real Anthropic API                           | Measuring real recall; needs `ANTHROPIC_API_KEY`; never in CI |
| `just e2e`       | `pnpm e2e` — Playwright against `apps/web`                                            | Before PR; after UI flow changes                              |
| `just lint`      | `pnpm lint` — ESLint                                                                  | Before commit                                                 |
| `just format`    | `pnpm format` — Prettier write                                                        | When the PostToolUse hook hasn't already                      |
| `just typecheck` | `pnpm typecheck` — `tsc --noEmit`                                                     | Before commit                                                 |
| `just build`     | `pnpm build` — production build                                                       | Before PR                                                     |
| `just ci`        | lint + typecheck + test + build                                                       | The merge gate; mirror of CI                                  |

All code recipes fail with a "not bootstrapped" message until M0 creates `package.json` — by design, so the docs-only scaffold is honest about its state.

## External data sources & APIs

| Source               | What for                                                 | Auth env var                                  | Cost / limits                                                               | Link                                                |
| -------------------- | -------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------- |
| Federal Register API | Federal rules/notices (CFPB et al.) — M1 primary adapter | none (public)                                 | Free; be polite (~1 req/s), paginate                                        | federalregister.gov/developers/documentation/api/v1 |
| Regulations.gov API  | Dockets, comments, deadlines                             | `DATA_GOV_API_KEY`                            | Free key; 1,000 req/hr default                                              | open.gsa.gov/api/regulationsgov                     |
| eCFR                 | Codified rule text snapshots (XML/JSON) — redline base   | none (public)                                 | Free bulk XML; daily point-in-time versions                                 | ecfr.gov/developers                                 |
| Agency RSS/HTML      | State regulator bulletins, guidance pages                | none                                          | Free; per-source adapter + recorded `tosBasis` (Invariant 8)                | per adapter                                         |
| LegiScan API         | 50-state legislature tracking                            | `LEGISCAN_API_KEY`                            | Free ≤30K queries/yr; broad coverage paid ~$5-15K/yr (budgeted shared COGS) | legiscan.com/legiscan                               |
| Open States API      | Legislature data cross-check                             | `OPENSTATES_API_KEY`                          | Free tier, rate-limited                                                     | docs.openstates.org                                 |
| Firecrawl            | Hostile/JS-heavy state sites only — last resort          | `FIRECRAWL_API_KEY`                           | Per-page credits; keep usage metered per source                             | firecrawl.dev                                       |
| Anthropic API        | Haiku triage, Sonnet synthesis + entailment              | `ANTHROPIC_API_KEY`                           | $5-15/customer/mo envelope (DESIGN.md); batch where possible                | docs.anthropic.com                                  |
| Slack API            | High-materiality alerts (paid tiers, M3)                 | `SLACK_BOT_TOKEN` (per-workspace OAuth later) | Free; respect chat rate limits                                              | api.slack.com                                       |
| Resend               | Email alerts + weekly digests                            | `RESEND_API_KEY`                              | Free dev tier                                                               | resend.com                                          |
| Stripe               | Subscriptions (M3)                                       | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`  | 2.9% + 30¢                                                                  | stripe.com/docs                                     |
| Inngest              | Scheduled pipeline orchestration                         | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`    | Free dev server locally; usage-priced cloud                                 | inngest.com/docs                                    |

**Never scrape** Lexis/Westlaw-hosted state administrative codes — those jurisdictions are `unsupported` (Invariant 8, DESIGN.md Risk 4).

## Required env vars

| Var                                                      | Purpose                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           | Postgres connection (local: `postgres://regdelta:regdelta@localhost:5432/regdelta`)   |
| `ANTHROPIC_API_KEY`                                      | Classify + triage + synthesis + entailment model calls (live ports + `eval:live`)     |
| `ANTHROPIC_MODEL_CHEAP`                                  | Override the cheap classify/triage model (default `claude-haiku-4-5-20251001`)        |
| `ANTHROPIC_MODEL_FRONTIER`                               | Override the synthesis/entailment model (default `claude-sonnet-4-6`)                 |
| `RUN_LIVE_EVAL`                                          | Set to `1` (with a key) to un-skip the live eval suite; `just eval-live` sets it      |
| `REGDELTA_SESSION_SECRET`                                | HMAC secret for reviewer sessions; when set, decisions REQUIRE a signed-in reviewer   |
| `REGDELTA_REVIEWERS`                                     | Comma-separated allowlist of reviewer emails permitted to sign in                     |
| `REGDELTA_ACCESS_CODE`                                   | Shared reviewer access code (paired with the allowlist); empty admits no one          |
| `DATA_GOV_API_KEY`                                       | regulations.gov                                                                       |
| `LEGISCAN_API_KEY`                                       | State legislature tracking (M1+: optional until states land)                          |
| `OPENSTATES_API_KEY`                                     | Legislature cross-check (optional)                                                    |
| `FIRECRAWL_API_KEY`                                      | Hostile-site adapters only (optional)                                                 |
| `SLACK_WEBHOOK_URL`                                      | Slack incoming-webhook alert delivery; when set, the preferred alert channel          |
| `RESEND_API_KEY` + `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | Resend email alerts (from + comma-separated recipients); used when no Slack webhook   |
| `SLACK_BOT_TOKEN`                                        | Reserved for richer Slack app integration (webhook covers M3 delivery)                |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`            | Stripe checkout + webhook signature verification (`verifyStripeSignature`)            |
| `STRIPE_PRICE_MULTI_STATE` / `STRIPE_PRICE_FIRM`         | Stripe price ids mapped to plan tiers (`tierForPriceId`)                              |
| `REGDELTA_PLAN_TIER`                                     | Demo entitlement override (`free_scan`/`multi_state`/`firm`); unset = permissive demo |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`              | Pipeline orchestration (cloud; local dev server needs none)                           |

Values live in `.env.local` (gitignored). Validate presence at startup; fail fast with a named-var error.

## Local services

- **Postgres 16 + pgvector** via `docker compose` (`just db-up`), image `pgvector/pgvector:pg16`, port 5432. Holds snapshots, the event log, projections, and embeddings. `docker-compose.yml` arrives with M0.
- **Inngest** serve endpoint is `app/api/inngest/route.ts` (GET/POST/PUT). The `daily-crawl-and-persist` cron function runs the pipeline → `persistPipelineRun`; it no-ops without `DATABASE_URL`. Local discovery: run the app (`just dev`) and `npx inngest-cli dev` against `/api/inngest`; no cloud account needed locally. Cloud needs `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`. Schema migrations are a deploy step (`just migrate`), not run from the web runtime.

## CI (.github/workflows/ci.yml)

- Triggers on `push` and `pull_request`; `ubuntu-latest`, Node 22 + corepack, just via `extractions/setup-just@v3`.
- **Bootstrapped guard:** if `package.json` is absent, the workflow emits a notice and skips install/build steps — the docs-only scaffold stays green. Once M0 lands, it runs `pnpm install --frozen-lockfile` then `just ci`.
- A `pgvector/pgvector:pg16` service container is wired via `DATABASE_URL` for tests; it is only exercised once the repo is bootstrapped.
- **Integration tests** (`*.int.test.ts`, e.g. the events append-only proof) `skipIf` `DATABASE_URL` is unset, so the offline unit suite needs no database; CI sets `DATABASE_URL` and runs the Postgres service, so they execute there and apply migrations themselves. Run locally with `just db-up` then `DATABASE_URL=… pnpm test` (note: a local Postgres already on :5432 will shadow the container — use a free port).

## AI harness notes (.claude/settings.json)

- **PostToolUse hooks:** Prettier auto-formats edited `ts/tsx/js/jsx/json/css/md`; ESLint `--fix` runs on edited `ts/tsx`. Both are no-ops until `package.json` exists.
- **Stop hook:** `tsc --noEmit` runs at session end (last 20 lines shown) — fix type errors before finishing, don't leave them for the next session.
- **Permissions:** `just`, `pnpm`, `node`, `npx vitest`, `npx playwright`, `docker compose`, and read-only git are pre-allowed.
- **Useful subagents:** `tdd-guide` for every new feature (gate and diff logic especially); `code-reviewer` after each change; `security-reviewer` for anything touching the event log, exports, auth, or customer profile data (it is regulated-adjacent customer data); `planner` before starting a milestone.
