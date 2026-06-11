import { verifyEventChain } from '@regdelta/core';
import { runPipeline } from '@regdelta/pipeline';
import { ChangeCardArticle } from './components/ChangeCardArticle';
import { CoverageTable } from './components/CoverageTable';
import { EventLedger } from './components/EventLedger';
import { GateChecklist } from './components/GateChecklist';

/**
 * M1 slice, rendered read-only: the deterministic pipeline runs at build time
 * against checked-in fixtures (no network, no database, LLM steps mocked) and
 * this page renders its output as the document of record.
 */
export default async function Page() {
  const result = await runPipeline();
  const published = result.published[0];
  const chain = verifyEventChain(result.events);

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

        <EventLedger events={result.events} chainValid={chain.valid} />
        <CoverageTable sources={result.sources} />
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
