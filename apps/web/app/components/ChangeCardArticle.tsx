import { NONE_STATED, type GateResult, type PublishedChangeCard } from '@regdelta/core';

const shortHash = (hash: string): string => `${hash.slice(0, 12)}…`;

interface ChangeCardArticleProps {
  readonly card: PublishedChangeCard;
  readonly gate: GateResult;
}

/** Read-only change card: provenance header, summary, blackline, pinned citations. */
export function ChangeCardArticle({ card, gate }: ChangeCardArticleProps) {
  return (
    <article aria-labelledby="card-title">
      <header className="card-head">
        <p className="card-flags">
          <span className={card.materiality === 'high' ? 'stamp stamp-high' : 'stamp stamp-normal'}>
            {card.materiality === 'high' ? 'High materiality' : 'Normal materiality'}
          </span>
          <span className="stamp stamp-pass">Gate: {gate.status}</span>
          <span className="stamp stamp-normal">Review: {card.reviewState}</span>
        </p>
        <h1 className="card-title" id="card-title">
          {card.title}
        </h1>
        <p className="card-provenance">
          card {card.id} · delta {card.deltaId} · published {card.publishedAt ?? 'not published'}
        </p>
      </header>

      <dl className="card-body">
        <div className="field">
          <dt>Summary</dt>
          <dd>{card.summary}</dd>
        </div>
        <div className="field">
          <dt>Rule text requires</dt>
          <dd>{card.requiredAction}</dd>
        </div>
        <div className="field">
          <dt>Effective date</dt>
          <dd>
            {card.effectiveDate === NONE_STATED ? (
              'None stated in the source text'
            ) : (
              <time className="deadline" dateTime={card.effectiveDate}>
                {card.effectiveDate}
              </time>
            )}
          </dd>
        </div>
        <div className="field">
          <dt>Affected products (candidate)</dt>
          <dd>{card.affectedProducts.join('; ')}</dd>
        </div>
      </dl>

      <section className="section" aria-labelledby="redline-label">
        <h2 className="section-label" id="redline-label">
          <span>Blackline — 12 CFR § 1026.40(b)</span>
          <span className="mono">del / ins</span>
        </h2>
        <p className="redline">
          {card.redline.map((op, index) => {
            if (op.kind === 'delete') {
              return <del key={index}>{op.text} </del>;
            }
            if (op.kind === 'insert') {
              return <ins key={index}>{op.text} </ins>;
            }
            return <span key={index}>{op.text} </span>;
          })}
        </p>
      </section>

      <section className="section" aria-labelledby="citations-label">
        <h2 className="section-label" id="citations-label">
          <span>Pinned citations</span>
          <span className="mono">byte-exact against stored snapshots</span>
        </h2>
        <ol className="citation-list">
          {card.claims.map((claim, index) => (
            <li className="citation" key={index}>
              <blockquote cite={claim.citation.sourceUrl}>{claim.citation.quotedText}</blockquote>
              <p className="citation-pin">
                {claim.citation.snapshotId} [{claim.citation.charStart}–{claim.citation.charEnd}) ·
                sha256 {shortHash(claim.citation.snapshotContentHash)} ·{' '}
                <a href={claim.citation.sourceUrl}>source</a>
              </p>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
