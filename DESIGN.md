# RegDelta — Design Doc

> Technical and product design for the citation-pinned obligation map. Read README.md (research dossier) first; this doc turns it into a buildable plan.

## Thesis

A compliance officer cannot cite ChatGPT to an examiner — but they can cite a pinned primary-source quote with a content hash, an effective date, and an unbroken version history. RegDelta wins by being the system of record for "we detected rule X on date Y and acted," not another alerting newsletter; the immutable audit log is both the deliverable and the switching cost. We stay honest about scope: **we detect and cite, you decide** — applicability classification is decision support, never legal judgment.

## Architecture

### Monorepo layout (pnpm workspace)

| Module              | Responsibility                                                                                                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | Next.js 15 (App Router, TS strict). Obligation map UI, change cards with redlines, coverage health page, editorial review queue, audit export, Slack/email settings, billing.                                                                   |
| `packages/core`     | Pure TypeScript domain logic, zero I/O. Event-sourcing reducers for the obligation graph, citation-pin validators, date/deadline parsing, materiality scoring, entailment-gate policy, export formatting. The most heavily unit-tested package. |
| `packages/pipeline` | Ingestion workers: source adapters, snapshot store, content-hash + structural diff engine, cheap-model triage, frontier synthesis, NLI entailment verification, alert dispatch. Orchestrated as Inngest functions.                              |
| `packages/db`       | Drizzle ORM schema + migrations. Postgres 16 + pgvector (profile and diff embeddings). Append-only event tables enforced at the schema level.                                                                                                   |

**Scheduling choice: Inngest** (not Temporal). The README's own assessment is right — this is a deterministic pipeline, not open-ended agency. Inngest gives us cron-scheduled, step-based functions with retries and replay, runs inside the Next.js deployment with a local dev server, and requires no self-hosted cluster — the right cost/ops profile for a 2-3 person team. Revisit Temporal only if we need multi-day durable workflows with human-in-the-loop timers that outgrow Inngest's model.

### Data flow (source → diff → triage → synthesis → surface)

```
[Sources: Federal Register API, regulations.gov, eCFR XML, agency RSS/HTML,
 LegiScan/Open States, per-state adapters]
        │  scheduled crawl (Inngest cron, per-source schedule + freshness SLA)
        ▼
[Snapshot store: normalized text in Postgres, raw blob ref, content hash]
        │  deterministic: content-hash compare + DOM-aware structural diff
        ▼
[Delta records]──── no LLM involved in DETECTING change, ever
        │  cheap model (Haiku) triage vs. company-profile embeddings (pgvector)
        ▼
[Applicability candidates, confidence-scored]
        │  frontier model (Sonnet) synthesis: change card + redline +
        │  offset-anchored quote pins into stored snapshots
        ▼
[Entailment gate: NLI verifier + deterministic validators
 (dates parse, citations resolve byte-exact, URLs live)]  ── FAIL → review queue, never publishes
        │  pass + (high materiality → human editorial approval)
        ▼
[Publish: obligation node / article version event + change card]
        ▼
[Surfaces: web obligation map, Slack/email alerts, weekly digest,
 examiner PDF/CSV export]
```

### Cost discipline: deterministic → cheap → frontier

- **Deterministic code**: crawl, snapshot, hash, structural diff, all validators, event log, exports. The change _detector_ is never an LLM.
- **Cheap model (Haiku-class)**: classify each in-jurisdiction delta ONCE into the topic taxonomy (`packages/core/taxonomy.ts`), not once per profile. Profiles map to topics deterministically (`topicSubscription` / `relevantDeltasForProfile`), so cost is O(deltas + profiles), not O(deltas × profiles), and the shared taxonomy + accumulated human decisions become a cross-customer asset. The classification queue is selected deterministically (`selectClassificationQueue` — every in-jurisdiction delta) and embeddings may only _rank_ that queue (`applyEmbeddingRanking`), never filter it: an embedding cut is a learned filter capable of the fatal false-negative class (Invariant 3). An unclassified delta (a taxonomy gap) is never dropped — it falls through to triage. A per-profile applicability triage still scores fanned-out candidates with the recall-biased threshold.
- **Frontier model (Sonnet-class)**: synthesis of change cards and article edits only, always followed by the entailment gate. Budget envelope: $5-15/customer/mo at 50-200 deltas/customer/mo (per dossier unit economics).
- **The gate's blind spot — `requiredAction`.** Entailment verifies that a quote supports a claim; it cannot verify "what you must do," which is interpretation and the closest field to legal advice. An auto-publishable `requiredAction` must be _advisory_ (`classifyRequiredAction`): it carries a confirm-applicability hedge and issues no customer-directed imperative. Any directive action routes to the human review queue (gate check `action_advisory`), independent of the forbidden-phrase check.
- **Materiality is measured, not assumed.** Auto-publish-vs-human-gate and the QA margin both ride on the `high` label, so it has its own eval (`materialityEval.ts` + corpus): recall on `high` is the fatal-class bar (`MATERIALITY_RECALL_BAR`), precision is the queue-flood floor. The eval runs inside `just ci`, so weakening the classifier blocks the merge.

## Data model sketch

- **Company** — name, vertical, products[], jurisdictions[], licenseTypes[], plan tier; `profile_embedding` (pgvector) regenerated on profile change.
- **Source** — adapterId, jurisdiction, agency, feedType (api|rss|html), crawlSchedule, freshnessSlaHours, status (active|degraded|unsupported), tosBasis (why we may crawl it).
- **Snapshot** — sourceId, fetchedAt, contentHash, normalizedText, rawBlobRef. Immutable once written.
- **Delta** — sourceId, fromSnapshotId, toSnapshotId, structuralDiff, detectedAt, triageState (pending|relevant|irrelevant|error), triageConfidence.
- **ChangeCard** — deltaId, companyId, summary, redline, affectedProducts[], requiredAction, deadline, effectiveDate, materiality (high|normal), citations[] (each = snapshotId + charStart + charEnd + quotedText), entailmentResult, reviewState (auto|pending_review|approved|rejected), publishedAt.
- **ObligationNode** — articleId, title, pinnedQuote (snapshotId + offsets + text), effectiveDate (or explicit `none_stated`), commentDeadline, status (proposed|effective|superseded), currentVersion.
- **Article** — topic-scoped living document, e.g. "BNPL lending — California": companyId/vertical scope, jurisdiction, orderedNodeIds[], version.
- **Event** — append-only audit log: seq, actorType (system|model|human), actorId, eventType, payloadJson, occurredAt, prevEventHash, eventHash (hash chain). Every state change above is an event; tables are projections.
- **AlertDelivery** — changeCardId, channel (slack|email|digest), sentAt, deliveryStatus.
- **ExportJob** — companyId, eventSeqRange, format (pdf|csv), generatedAt, contentChecksum.

## Key flows

### 1. Daily delta pipeline (the core loop)

1. Inngest cron fires per-source crawl; adapter fetches, normalizes, stores Snapshot with content hash.
2. Hash unchanged → record freshness heartbeat, stop. Hash changed → structural diff → Delta.
3. Crawl failure or staleness beyond `freshnessSlaHours` → ops alert + source marked degraded on the customer-visible coverage health page. Silence never means "no changes."
4. Triage: Haiku scores Delta against each subscribed company profile (embedding shortlist first, then model call). Below threshold → logged as irrelevant (still auditable). Above → synthesis.
5. Sonnet drafts ChangeCard with redline and offset-anchored citations into the stored snapshots.
6. Entailment gate: NLI verifier checks every claim is entailed by cited text; deterministic validators check dates parse, quoted spans match snapshots byte-exact, citations resolve. Any failure → review queue with diagnostics; nothing publishes.
7. High materiality → human editorial approval required (year-1 invariant). Normal → auto-publish after gate.
8. Publish = append events (card published, nodes/article versioned) → Slack/email alert (high materiality immediate, rest into weekly digest).

### 2. Onboarding & exposure scan (land motion)

1. Customer completes profile: products × jurisdictions × license types.
2. System compiles the monitored source set for that profile; anything we cannot legitimately cover (e.g. Lexis/Westlaw-hosted state codes) is shown as **unsupported — explicitly, at signup**, not silently degraded.
3. Free 30-day exposure scan generates the initial obligation map from current snapshots (articles + nodes, all citation-pinned).
4. Customer reviews map; every node shows source quote, effective date, "decision support — confirm applicability" framing.

### 3. Examiner export (the trust artifact)

1. User selects a date/event range and format (PDF or CSV).
2. Export service replays the event log for that range: detections, classifications (with model + confidence), human decisions, publish timestamps, hash chain.
3. Output is reproducible: same event range → identical content checksum (generation timestamp excluded). Checksum printed on the artifact.

### 4. Editorial review (human gate)

1. Reviewer opens queue: entailment failures + all high-materiality cards.
2. Side-by-side: drafted card vs. pinned source spans highlighted in the snapshot.
3. Approve / edit (re-runs entailment gate) / reject — every action is an event with actor identity. A model can never mark a delta not-applicable for a customer; only a human can, and that decision is logged.

### 5. Coverage health

1. Dashboard lists every monitored source with last-success time, SLA status, and adapter version.
2. SLA breach → internal ops alert; ≥48h breach → customer-visible banner on affected articles ("coverage gap since DATE").
3. Monthly coverage report is exportable — proving we monitor is part of the product.
4. **Completeness ≠ liveness.** Freshness (`evaluateFreshness`) answers "are the sources we monitor live?" — it cannot catch the fatal omission of a relevant authority we never watch (Risk 1). `assessCoverageCompleteness` (`packages/core/coverage.ts`) cross-checks each subscribed topic's `expectedAuthorities` against the monitored source set; an expected authority with no monitored source is a **blind spot**, surfaced explicitly (e.g. a CA-exposed profile while only federal sources are monitored) rather than silently rendered as covered.

## Product & visual design direction

**"Document of record" — legal-ledger editorial, light by default.** This product is shown to examiners; it must look like an authoritative instrument, not a SaaS dashboard. Paper-white surfaces (`oklch(98.5% 0.004 90)`) with ink-black text and an oxblood accent (`oklch(42% 0.12 25)`) reserved for deadlines and high-materiality flags — color is semantic, never decorative. Typography pairing: a serif with legal gravitas (Source Serif 4) for article and rule text, a precise grotesk (Inter) for UI chrome, and a monospace (IBM Plex Mono) for hashes, citations, offsets, and dates — provenance data should _look_ like evidence. Redlines use classic legal-blackline conventions: struck-through deletions in red, underlined insertions in blue. Dense, ruled layouts with hairline borders and generous serif line-height; version history rendered as a ledger column, not a timeline widget. No dark mode in v1; print/PDF parity is a first-class design target.

## Milestones

### M0 — Bootstrap (make `just ci` green)

Scaffold the pnpm workspace exactly as the module map above: root `package.json` with `dev/test/e2e/lint/format/typecheck/build` scripts, the four workspace packages (placeholder entrypoints + one passing vitest each), `docker-compose.yml` with `pgvector/pgvector:pg16`, Drizzle config + initial empty migration in `packages/db` (with a `migrate` script), ESLint + Prettier, Playwright config in `apps/web`.
**Accept when:** `just setup && just db-up && just migrate && just ci` all pass locally; CI workflow runs `just ci` green on push.

### M1 — Thin vertical slice (consumer lending, federal)

One vertical (consumer lending), one adapter: Federal Register API filtered to CFPB documents, plus eCFR Title 12 part snapshots. Daily Inngest crawl → snapshot → hash/structural diff → triage vs. one seeded company profile → Sonnet change card with pinned citations → entailment gate → card rendered in web UI with redline. No alerts, no billing, no states yet.
**Accept when:** a real CFPB Federal Register document flows end-to-end into a published change card whose every citation resolves byte-exact against the stored snapshot; an artificially corrupted card is blocked by the gate (test proves it); all pipeline steps appear in the event log.

### M2 — Trust layer

Hash-chained append-only event log with DB-level enforcement (no UPDATE/DELETE grants on event tables); reproducible examiner PDF/CSV export with checksum; coverage health page with freshness SLAs and degradation banners; editorial review queue with the high-materiality human gate; entailment + validator eval corpus (≥50 hand-labeled cards including known-omission traps) with measured recall on material changes.
**Accept when:** export of the same event range twice yields identical checksums; an attempted UPDATE on the event table fails at the DB; a stale source visibly degrades within one SLA window; gate eval recall on material-change corpus ≥99% documented.

### M3 — Monetization wiring

Stripe subscriptions at the adversarial-review-corrected price points: Multi-state $599/mo and Firm tier (multi-client profiles, white-label digests) — **no $199 tier** (negative margin with editorial QA per dossier). Free 30-day exposure scan as the land motion; audit export and version history gated to paid; Slack alerts; per-jurisdiction add-on pricing; annual prepay option.
**Accept when:** a customer can self-serve from exposure scan → paid Multi-state → receives a Slack alert for a high-materiality card → downloads a gated examiner export; Stripe webhooks reconciled into the event log.

## Non-goals (v1)

Scope discipline is a survival requirement here (see Risk 1), so these are explicit:

- **No legal advice.** We never output "this applies to you" as a conclusion — only cited rule text, a confidence-scored applicability candidate, and a logged human decision.
- **No multi-vertical coverage** until consumer lending hits the M2 recall bar. Shallow breadth in a "we never miss" product is self-refuting (the dossier's own words).
- **No general-web monitoring.** Government primary sources only — that is the moat against the publisher-blocking wall, and the ToS posture depends on it.
- **No chat interface.** A regenerating chatbot cannot be an audit trail; the surfaces are the map, the cards, the queue, and the export.
- **No $199 tier, no seat-based pricing.** Expansion axis is jurisdictions and domains, per the revenue-model analysis.
- **No dark mode, no mobile app** in v1. Print/PDF parity beats both for this buyer.

## Risks & mitigations (from adversarial review)

### 1. False-negative omissions (the fatal error class)

Missed applicable changes are invisible until an examiner finds them, and the entailment check structurally cannot catch omissions — it only verifies what _was_ written.
**Mitigation:** change detection is fully deterministic (hash diff — a changed source can never be silently skipped by a model); triage thresholds tuned for recall, with every dismissal logged and auditable; freshness SLAs make coverage gaps loud and customer-visible rather than silent; declared scope stays narrow (one vertical, ~10 jurisdictions) so "we never miss" is only claimed where it is true; M2 ships an omission-trap eval corpus with a ≥99% recall bar on material changes.

### 2. The cheap slot is already contested

Changeflow sells from $99/mo today; Hadrius, Bretton, RegPulse, and a YC compliance pipeline attack from adjacent wedges; CUBE's consolidation creates an incumbent with every incentive to ship a self-serve tier.
**Mitigation:** do not compete on alerting or race to $99. Differentiate on what an alert feed or regenerating chatbot structurally cannot be — the citation-pinned obligation map and the immutable, exportable audit trail — and price at $599+ where that artifact justifies it. Speed matters: M1/M2 are the moat, M3 can wait.

### 3. The margin story breaks under human QA

Expert editorial review costs $100-300/customer/mo, which is negative-margin at $199 and halves margin at $499.
**Mitigation:** drop the $199 tier entirely (M3 prices at $599+). The human gate is scoped to high-materiality cards only; review tooling (flow 4) is optimized for reviewer throughput as a first-class product surface; auto-publish scope expands only when the eval corpus proves it (M2 promotion criterion). Plan for an honest 60-75% gross margin, not the pitched 90%.

### 4. State data access and ToS walls

Many state administrative codes are officially published via Lexis/Westlaw-hosted portals with restrictive terms — breaking the redline promise exactly where the "why now" (state fragmentation) lives; broad LegiScan coverage is paid.
**Mitigation:** hard invariant — crawl only sources with a recorded permissible-access basis (`tosBasis` on every Source). Lexis/Westlaw-hosted codes are marked **unsupported** and disclosed at onboarding, never scraped and never silently degraded. Where prior rule text is unavailable, ship "summary-only, no redline" honestly. LegiScan paid tier (~$5-15K/yr) is budgeted as shared COGS across all customers.

### 5. Trust cold-start and liability cut both ways

One wrong deadline is career-level damage to the exact buyer persona, word travels in a small community, and the immutable log is discoverable evidence that we told the customer the wrong thing.
**Mitigation:** "we detect and cite, you decide" is embedded in product copy, contract language, and UI — applicability output always carries confidence, rationale, and review status, never a legal conclusion, and only a human can dismiss a delta. Provenance is visible on every node. The reproducible export and the entailment gate are _demoable_ trust artifacts in the sales motion, and the free exposure scan lets buyers verify coverage breadth before paying a dollar.
