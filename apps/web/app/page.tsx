import { buildAuditExport, reviewQueue, verifyEventChain } from '@regdelta/core';
import { runPipeline } from '@regdelta/pipeline';
import { ChangeCardArticle } from './components/ChangeCardArticle';
import { CoverageHealth } from './components/CoverageHealth';
import { EventLedger } from './components/EventLedger';
import { GateChecklist } from './components/GateChecklist';
import { ReviewQueue } from './components/ReviewQueue';

/**
 * M1 slice, rendered read-only: the deterministic pipeline runs at build time
 * against checked-in fixtures (no network, no database, LLM steps mocked) and
 * this page renders its output as the document of record.
 */
export default async function Page() {
  const result = await runPipeline();
  const published = result.published[0];
  const chain = verifyEventChain(result.events);

  // Derived read-models for the surfaces below.
  const cards = [...result.published, ...result.reviewQueue].map((gated) => gated.card);
  const queue = reviewQueue(cards, result.events);
  const now = result.events.at(-1)?.occurredAt ?? result.events[0]?.occurredAt ?? '';
  const lastSuccessBySource: Record<string, string> = {};
  for (const snapshot of result.snapshots.values()) {
    const prev = lastSuccessBySource[snapshot.sourceId];
    if (prev === undefined || snapshot.fetchedAt > prev) {
      lastSuccessBySource[snapshot.sourceId] = snapshot.fetchedAt;
    }
  }
  const audit = buildAuditExport({
    events: result.events,
    format: 'csv',
    generatedAt: result.events[0]?.occurredAt,
  });

  return (
    <>
      <header className="masthead">
        <p className="masthead-brand">
          Reg<span className="delta">Delta</span>
        </p>
        <p className="masthead-meta">
          Obligation record · {result.profile.name} · run {result.events[0]?.occurredAt ?? '—'}
        </p>
      </header>
      <p className="doctrine">
        We detect and cite — you decide. Applicability output is decision support with confidence
        and review status, never a legal conclusion.
      </p>
      <p className="record-actions">
        <a className="action-link" href="/export" download>
          Download examiner export (CSV)
        </a>
        <span className="mono">
          checksum {audit.checksum.slice(0, 16)}… · {audit.eventCount} events
        </span>
      </p>

      <main>
        {published !== undefined ? (
          <>
            <section className="section" aria-label="Published change card">
              <ChangeCardArticle card={published.card} gate={published.gate} />
            </section>
            <GateChecklist gate={published.gate} />
          </>
        ) : (
          <section className="section" aria-label="No published cards">
            <h1 className="card-title">No change cards published</h1>
            <p>
              Nothing passed triage and the entailment gate for this profile. Every dismissal is
              still recorded in the audit ledger below.
            </p>
          </section>
        )}

        <ReviewQueue queue={queue} />
        <EventLedger events={result.events} chainValid={chain.valid} />
        <CoverageHealth
          sources={result.sources}
          coverage={result.coverage}
          lastSuccessBySource={lastSuccessBySource}
          now={now}
        />
      </main>

      <footer className="colophon">
        <p>
          Pipeline provider: <code>{result.provider}</code> — change detection is deterministic
          (content hash + structural diff); models only triage and synthesize, behind the gate.
        </p>
        <p>
          RegDelta is decision support, not legal advice. Confirm applicability with qualified
          counsel.
        </p>
      </footer>
    </>
  );
}
