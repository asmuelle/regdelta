# RegDelta

[![CI](https://github.com/asmuelle/regdelta/actions/workflows/ci.yml/badge.svg)](https://github.com/asmuelle/regdelta/actions/workflows/ci.yml)

> A living, citation-pinned obligation map for SME compliance teams: an agent watches regulators in your jurisdictions daily and maintains an always-current, audit-ready wiki of what changed, who it affects, and what you must do by when — at 1/30th of enterprise RCM pricing.

**Category:** LLM wiki / auto-research (living documents + delta alerts, à la Karpathy)

## Concept

A living, citation-pinned obligation map for SME compliance teams: an agent watches regulators in your jurisdictions daily and maintains an always-current, audit-ready wiki of what changed, who it affects, and what you must do by when — at 1/30th of enterprise RCM pricing.

## Target User

Compliance officers and ops leads running 1-3 person compliance functions at SME fintechs, healthtech companies, lenders, crypto custodians, and accounting firms covering multiple states. The clearest underserved budget-holder found: a ~$1.1B RCM market growing 8.7-15.8% CAGR where 44% still track manually, and a missed effective date is a personal, career-level liability.

## Auto-Research Mechanic (the living document + delta engine)

Onboarding compiles a company profile (products x jurisdictions x license types) into a monitored primary-source set: Federal Register, agency dockets and guidance (CFPB, FinCEN, OCC, SEC, HHS/OCR, FDA), state regulator bulletins, legislature trackers, EUR-Lex/FCA for cross-border, enforcement-action feeds. Daily content-hash diffing of structured, crawl-friendly government sources; cheap-model triage classifies applicability against the company profile; frontier pass updates topic-scoped living articles ('BNPL lending — California'), each obligation node carrying pinned source text, effective date, comment deadline, and full version history. Deltas ship as change cards with a redline against prior rule text, affected products, required action, and deadline; an entailment check runs before any edit publishes. High-materiality items alert immediately; the rest lands in a weekly digest. Full versioned change history exports as an examiner-facing audit log.

## Product Surface

Web SaaS as system of record (obligation map, redline diffs, immutable change log, PDF/CSV audit-trail export — the artifact compliance buyers show examiners) with Slack and email delta alerts.

## Why Now (2026 timing)

14,000+ regulatory updates/year with accelerating state-level fragmentation (privacy, AI rules, money-transmitter licensing) make a 1-person manual function impossible. Incumbent RCM is quote-only with zero self-serve tier and zero cheap challengers found. Government primary sources are openly crawlable — immune to the publisher-blocking wall (Cloudflare pay-per-crawl, RSL, 79% of top news sites blocking bots) strangling general-web agents.

## Tech Stack & Unit Economics

Ingestion: Federal Register API + regulations.gov API + eCFR XML (all free) for federal; agency RSS/HTML fetchers; LegiScan API paid tier (~$5-15K/yr for broad state coverage) plus Open States for legislatures; per-state adapter scrapers (Zyte/Firecrawl for hostile sites) for regulator bulletins; manual/licensed workaround needed where admin codes are Lexis/Westlaw-hosted. Pipeline: scheduled crawl (plain cron/queue or Temporal — this is a deterministic pipeline, not open-ended agency), normalized text snapshots in Postgres+S3, content-hash plus DOM-aware structural diffing. Triage: Haiku 4.5 or Gemini Flash classifying diffs against company-profile embeddings (products x jurisdictions x license types). Synthesis: Sonnet 4.6-class generating change cards with offset-anchored quote pins into stored source snapshots; separate NLI/entailment verifier pass plus deterministic validators (dates parse, citations resolve, effective dates match source text). Storage: event-sourced obligation graph in Postgres for immutable version history; PDF/CSV export service. Delivery: web app + Slack/email. Human layer (non-negotiable in year 1): editorial review queue gating high-materiality cards. Unit economics at ~100 customers: shared crawl infra $3-5/customer/mo, LegiScan amortized $4-15, cheap-model triage $3-10, frontier synthesis + verification $5-15 (50-200 deltas/customer/mo at $0.10-0.50 each) = $15-45/mo pure machine COGS — close to the pitch's claim. But expert QA at even 1-2 hrs/customer/mo adds $100-300, making realistic blended COGS $120-350/customer/mo initially, declining as the applicability classifier earns trust. Realistic gross margin: 60-75% at the $499 tier, negative at $199 with QA. Viable shape: drop the $199 tier, launch single-vertical (consumer lending or money transmission), ~10 jurisdictions, $499/$999 pricing.
