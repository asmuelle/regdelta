import {
  buildAuditExport,
  projectReviewState,
  reviewQueue,
  verifyEventChain,
} from '@regdelta/core';
import { runPipeline } from '@regdelta/pipeline';
import { submitDecision } from './actions';
import { loadLiveLog } from './liveLog';
import { ChangeCardArticle } from './components/ChangeCardArticle';
import { CoverageHealth } from './components/CoverageHealth';
import { EventLedger } from './components/EventLedger';
import { GateChecklist } from './components/GateChecklist';
import { ReviewQueue } from './components/ReviewQueue';

// Dynamic: the page reads the persisted event log at request time when a database
// is configured (so reviewer decisions are reflected). Without one it degrades to
// the in-process pipeline run, so the build and the demo work with no database.
export const dynamic = 'force-dynamic';

/**
 * The obligation record. The deterministic pipeline supplies the change card,
 * gate, coverage, and sources; the event log (and thus review state) comes from
 * Postgres when configured, otherwise from the in-memory run.
 */
export default async function Page() {
  const result = await runPipeline();
  const { events, interactive } = await loadLiveLog(result);

  const published = result.published[0];
  const displayedCard =
    published === undefined ? undefined : projectReviewState(published.card, events);
  const chain = verifyEventChain(events);

  const cards = [...result.published, ...result.reviewQueue].map((gated) => gated.card);
  const queue = reviewQueue(cards, events);
  const now = events.at(-1)?.occurredAt ?? events[0]?.occurredAt ?? '';
  const lastSuccessBySource: Record<string, string> = {};
  for (const snapshot of result.snapshots.values()) {
    const prev = lastSuccessBySource[snapshot.sourceId];
    if (prev === undefined || snapshot.fetchedAt > prev) {
      lastSuccessBySource[snapshot.sourceId] = snapshot.fetchedAt;
    }
  }
  const audit = buildAuditExport({ events, format: 'csv', generatedAt: events[0]?.occurredAt });

  return (
    <>
      <header className="masthead">
        <p className="masthead-brand">
          Reg<span className="delta">Delta</span>
        </p>
        <p className="masthead-meta">
          Obligation record · {result.profile.name} ·{' '}
          {interactive ? 'live (database)' : 'read-only (in-process)'}
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
        {published !== undefined && displayedCard !== undefined ? (
          <>
            <section className="section" aria-label="Published change card">
              <ChangeCardArticle card={displayedCard} gate={published.gate} />
              {interactive ? (
                <div className="reviewer-controls" role="group" aria-label="Reviewer decision">
                  <span className="reviewer-controls-label">Reviewer decision</span>
                  <form action={submitDecision} className="decision-form">
                    <input type="hidden" name="cardId" value={displayedCard.id} />
                    <input type="hidden" name="kind" value="approve_card" />
                    <button type="submit" className="decision approve">
                      Approve
                    </button>
                  </form>
                  <form action={submitDecision} className="decision-form">
                    <input type="hidden" name="cardId" value={displayedCard.id} />
                    <input type="hidden" name="kind" value="reject_card" />
                    <button type="submit" className="decision reject">
                      Reject
                    </button>
                  </form>
                </div>
              ) : null}
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

        <ReviewQueue queue={queue} interactive={interactive} />
        <EventLedger events={events} chainValid={chain.valid} />
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
