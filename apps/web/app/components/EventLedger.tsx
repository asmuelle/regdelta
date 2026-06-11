import type { EventRecord } from '@regdelta/core';

const shortHash = (hash: string | null): string => (hash === null ? '∅' : `${hash.slice(0, 12)}…`);

interface EventLedgerProps {
  readonly events: readonly EventRecord[];
  readonly chainValid: boolean;
}

/** Append-only audit ledger: every pipeline step, hash-chained (Invariant 4). */
export function EventLedger({ events, chainValid }: EventLedgerProps) {
  return (
    <section className="section" aria-labelledby="ledger-label">
      <h2 className="section-label" id="ledger-label">
        <span>Audit ledger</span>
        <span className="mono">chain {chainValid ? 'verified' : 'BROKEN'}</span>
      </h2>
      <table className="ruled-table">
        <caption>
          Append-only event log. Corrections are new events; each entry chains to its predecessor by
          hash.
        </caption>
        <thead>
          <tr>
            <th scope="col">Seq</th>
            <th scope="col">Occurred</th>
            <th scope="col">Actor</th>
            <th scope="col">Event</th>
            <th scope="col">Hash</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.seq}>
              <td>{event.seq}</td>
              <td>{event.occurredAt}</td>
              <td>
                {event.actorType}:{event.actorId}
              </td>
              <td>{event.eventType}</td>
              <td>{shortHash(event.eventHash)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
