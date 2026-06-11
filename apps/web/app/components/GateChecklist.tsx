import type { GateResult } from '@regdelta/core';

/** Deterministic validator + entailment results — the publish gate, made visible. */
export function GateChecklist({ gate }: { readonly gate: GateResult }) {
  return (
    <section className="section" aria-labelledby="gate-label">
      <h2 className="section-label" id="gate-label">
        <span>Entailment gate</span>
        <span className="mono">route: {gate.route}</span>
      </h2>
      <table className="ruled-table">
        <caption>
          No LLM-generated text reaches this surface without passing every check. Failures route to
          the review queue — there is no bypass.
        </caption>
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Result</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {gate.checks.map((check) => (
            <tr key={check.code}>
              <td>{check.code}</td>
              <td className={check.passed ? 'check-pass' : 'check-fail'}>
                {check.passed ? 'PASS' : 'FAIL'}
              </td>
              <td className="prose">{check.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
