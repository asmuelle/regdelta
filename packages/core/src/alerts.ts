import type { EventRecord, PublishedChangeCard } from './types';

function isApprovalOf(event: EventRecord, cardId: string): boolean {
  if (event.eventType !== 'human_decision' || event.actorType !== 'human') {
    return false;
  }
  const payload = event.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  return payload['kind'] === 'approve_card' && payload['subjectId'] === cardId;
}

/**
 * Invariant 7: a high-materiality card may never dispatch an alert without a
 * logged human approval event. Normal-materiality cards may alert once published.
 */
export function canDispatchAlert(
  card: PublishedChangeCard,
  events: readonly EventRecord[],
): boolean {
  if (card.publishedAt === null) {
    return false;
  }
  if (card.materiality === 'normal') {
    return true;
  }
  return events.some((event) => isApprovalOf(event, card.id));
}
