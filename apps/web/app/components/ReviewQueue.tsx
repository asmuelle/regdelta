import type { PublishedChangeCard } from '@regdelta/core';
import { submitDecision } from '../actions';

interface ReviewQueueProps {
  /** Cards still awaiting a human decision (gate failures + unapproved high-materiality). */
  readonly queue: readonly PublishedChangeCard[];
  /** When true (database-backed), render approve/reject controls wired to the server action. */
  readonly interactive: boolean;
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

function DecisionButton({ cardId, kind, label }: { cardId: string; kind: string; label: string }) {
  return (
    <form action={submitDecision} className="decision-form">
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="kind" value={kind} />
      <button
        type="submit"
        className={kind === 'approve_card' ? 'decision approve' : 'decision reject'}
      >
        {label}
      </button>
    </form>
  );
}

/**
 * Editorial review queue (DESIGN.md flow 4). Read-only without a database; with one,
 * approve/reject post to a server action that records a logged human_decision event
 * (a model/system actor can never resolve a card).
 */
export function ReviewQueue({ queue, interactive }: ReviewQueueProps) {
  return (
    <section className="section" aria-labelledby="review-label">
      <h2 className="section-label" id="review-label">
        <span>Review queue</span>
        <span className="mono">
          {queue.length} awaiting{interactive ? '' : ' · read-only'}
        </span>
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
              {interactive ? <th scope="col">Decision</th> : null}
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
                {interactive ? (
                  <td className="decision-cell">
                    <DecisionButton cardId={card.id} kind="approve_card" label="Approve" />
                    <DecisionButton cardId={card.id} kind="reject_card" label="Reject" />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
