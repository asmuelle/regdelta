import type { SourceDefinition } from '@regdelta/core';

/** Monitored sources with their recorded permissible-access basis (Invariant 8). */
export function CoverageTable({ sources }: { readonly sources: readonly SourceDefinition[] }) {
  return (
    <section className="section" aria-labelledby="coverage-label">
      <h2 className="section-label" id="coverage-label">
        <span>Monitored sources</span>
        <span className="mono">M1 scope: consumer lending, federal</span>
      </h2>
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
            <th scope="col">Access basis</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id}>
              <td>{source.id}</td>
              <td className="prose">{source.agency}</td>
              <td>{source.crawlSchedule}</td>
              <td>{source.freshnessSlaHours}h</td>
              <td className="prose">{source.tosBasis}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
