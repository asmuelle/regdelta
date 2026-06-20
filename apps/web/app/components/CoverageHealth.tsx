import {
  evaluateFreshness,
  type CoverageCompletenessReport,
  type SourceDefinition,
} from '@regdelta/core';

interface CoverageHealthProps {
  readonly sources: readonly SourceDefinition[];
  readonly coverage: CoverageCompletenessReport;
  /** Latest successful crawl time per source id (max snapshot fetchedAt). */
  readonly lastSuccessBySource: Readonly<Record<string, string>>;
  readonly now: string;
}

/**
 * Coverage health (Invariant 5): liveness AND completeness. The table shows each
 * monitored source's freshness against its SLA; the panel shows subscribed
 * authorities we do NOT monitor as explicit blind spots — never silently "covered".
 */
export function CoverageHealth({
  sources,
  coverage,
  lastSuccessBySource,
  now,
}: CoverageHealthProps) {
  return (
    <section className="section" aria-labelledby="coverage-label">
      <h2 className="section-label" id="coverage-label">
        <span>Coverage health</span>
        <span className="mono">
          {coverage.complete ? 'complete' : `${coverage.blindSpots.length} blind spot(s)`}
        </span>
      </h2>

      {coverage.blindSpots.length > 0 ? (
        <div className="coverage-gap" role="note">
          <p className="coverage-gap-head">Completeness gap — subscribed, not yet monitored</p>
          <ul className="coverage-gap-list">
            {coverage.blindSpots.map((spot) => (
              <li key={`${spot.topicId}:${spot.jurisdiction}`}>
                {spot.agency} <span className="mono">({spot.jurisdiction})</span> — {spot.reason}
              </li>
            ))}
          </ul>
          <p className="coverage-gap-foot">
            Completeness is not liveness: these authorities are in scope for this profile but have
            no monitored source, so they are disclosed here rather than rendered as covered.
          </p>
        </div>
      ) : null}

      <table className="ruled-table">
        <caption>
          Silence never means “no changes”: every source carries a freshness SLA, and coverage gaps
          surface visibly.
        </caption>
        <thead>
          <tr>
            <th scope="col">Source</th>
            <th scope="col">Agency</th>
            <th scope="col">Schedule</th>
            <th scope="col">SLA</th>
            <th scope="col">Freshness</th>
            <th scope="col">Access basis</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => {
            const lastSuccessAt = lastSuccessBySource[source.id];
            const status =
              lastSuccessAt === undefined
                ? 'unknown'
                : evaluateFreshness({
                    lastSuccessAt,
                    now,
                    freshnessSlaHours: source.freshnessSlaHours,
                  });
            return (
              <tr key={source.id}>
                <td>{source.id}</td>
                <td className="prose">{source.agency}</td>
                <td>{source.crawlSchedule}</td>
                <td>{source.freshnessSlaHours}h</td>
                <td className={status === 'fresh' ? 'check-pass' : 'check-fail'}>
                  {status.toUpperCase()}
                </td>
                <td className="prose">{source.tosBasis}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
