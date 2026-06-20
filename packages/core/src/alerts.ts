import { NONE_STATED, type EventRecord, type Materiality, type PublishedChangeCard } from './types';

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

export interface AlertContent {
  readonly subject: string;
  readonly body: string;
  readonly materiality: Materiality;
}

/**
 * Build the human-facing alert text for a card. Decision-support framing only —
 * never a legal conclusion (Invariant 6). Pure; delivery is a separate concern.
 */
export function buildAlertContent(card: PublishedChangeCard): AlertContent {
  const effective =
    card.effectiveDate === NONE_STATED ? 'none stated in source' : card.effectiveDate;
  const lines = [
    card.summary,
    `Effective: ${effective}`,
    card.deadline === null ? null : `Deadline: ${card.deadline}`,
    `What the rule text requires (decision support — confirm applicability): ${card.requiredAction}`,
    `Affected products (candidate): ${card.affectedProducts.join('; ')}`,
    `Card ${card.id} · delta ${card.deltaId}`,
  ].filter((line): line is string => line !== null);
  return {
    subject: `[RegDelta${card.materiality === 'high' ? ' · HIGH MATERIALITY' : ''}] ${card.title}`,
    body: lines.join('\n'),
    materiality: card.materiality,
  };
}

/** Cards eligible to alert right now (published; high-materiality needs approval). */
export function eligibleAlertCards(
  cards: readonly PublishedChangeCard[],
  events: readonly EventRecord[],
): readonly PublishedChangeCard[] {
  return cards.filter((card) => canDispatchAlert(card, events));
}
