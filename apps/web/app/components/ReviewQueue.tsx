import type { PublishedChangeCard } from '@regdelta/core';

interface ReviewQueueProps {
  /** Cards still awaiting a human decision (gate failures + unapproved high-materiality). */
  readonly queue: readonly PublishedChangeCard[];
}

function reason(card: PublishedChangeCard): string {
  if (card.reviewState === 'pending_review') {
    return 'gate routed to review';
  }
  if (card.materiality === 'high') {
    return 'high materiality — approval required before alerting (Invariant 7)';
  }
  return 'awaiting review';
}

/**
 * Editorial review queue (DESIGN.md flow 4): cards a human must resolve before they
 * alert. Read-only here; approve/reject are logged human_decision events recorded
 * through the persistence layer (a model/system actor can never resolve a card).
 */
export function ReviewQueue({ queue }: ReviewQueueProps) {
  return (
    <section className="section" aria-labelledby="review-label">
      <h2 className="section-label" id="review-label">
        <span>Review queue</span>
        <span className="mono">{queue.length} awaiting</span>
      </h2>
      {queue.length === 0 ? (
        <p className="queue-empty">
          Nothing awaiting review for this run. A card enters the queue when the gate routes it here
          or when it is high-materiality and not yet approved — only a logged human decision moves
          it out.
        </p>
      ) : (
        <table className="ruled-table">
          <caption>
            Approve publishes a held card and stamps the decision time; reject un-publishes it.
            Every action is an event with the reviewer’s identity.
          </caption>
          <thead>
            <tr>
              <th scope="col">Card</th>
              <th scope="col">Materiality</th>
              <th scope="col">State</th>
              <th scope="col">Why queued</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((card) => (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td className={card.materiality === 'high' ? 'check-fail' : ''}>
                  {card.materiality}
                </td>
                <td>{card.reviewState}</td>
                <td className="prose">{reason(card)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
