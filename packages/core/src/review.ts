/**
 * Editorial review queue projections (DESIGN.md flow 4; Invariants 6/7).
 *
 * Writes are events only — a human decision is recorded via `recordHumanDecision`
 * (triage.ts) and appended to the log. This module is the read side: it projects a
 * card's resolved review state from those events and computes the queue of cards
 * still needing a human. No model or system actor can resolve a card here; only a
 * logged human_decision event moves it out of review.
 */
import type { EventRecord, PublishedChangeCard } from './types';

export type ReviewDecisionKind = 'approve_card' | 'reject_card';

interface DecisionRef {
  readonly kind: ReviewDecisionKind;
  readonly occurredAt: string;
  readonly seq: number;
}

function decisionFor(event: EventRecord, cardId: string): ReviewDecisionKind | null {
  if (event.eventType !== 'human_decision' || event.actorType !== 'human') {
    return null;
  }
  const payload = event.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  if (payload['subjectId'] !== cardId) {
    return null;
  }
  const kind = payload['kind'];
  return kind === 'approve_card' || kind === 'reject_card' ? kind : null;
}

/** The most recent human approve/reject decision for a card, or null. */
export function latestDecision(cardId: string, events: readonly EventRecord[]): DecisionRef | null {
  let latest: DecisionRef | null = null;
  for (const event of events) {
    const kind = decisionFor(event, cardId);
    if (kind !== null && (latest === null || event.seq > latest.seq)) {
      latest = { kind, occurredAt: event.occurredAt, seq: event.seq };
    }
  }
  return latest;
}

/**
 * Project a card's resolved state from the log. Approval publishes a held card
 * (sets publishedAt to the approval time if not already published); rejection
 * un-publishes it. With no decision, the card is returned unchanged.
 */
export function projectReviewState(
  card: PublishedChangeCard,
  events: readonly EventRecord[],
): PublishedChangeCard {
  const decision = latestDecision(card.id, events);
  if (decision === null) {
    return card;
  }
  if (decision.kind === 'reject_card') {
    return { ...card, reviewState: 'rejected', publishedAt: null };
  }
  return { ...card, reviewState: 'approved', publishedAt: card.publishedAt ?? decision.occurredAt };
}

function awaitingHuman(card: PublishedChangeCard, events: readonly EventRecord[]): boolean {
  const projected = projectReviewState(card, events);
  if (projected.reviewState === 'rejected' || projected.reviewState === 'approved') {
    return false;
  }
  // Gate-failed cards sit in pending_review; high-materiality cards need approval
  // before they can alert (Invariant 7), so they stay in the queue until approved.
  return projected.reviewState === 'pending_review' || card.materiality === 'high';
}

/** Cards still needing a human decision: gate failures + unapproved high-materiality. */
export function reviewQueue(
  cards: readonly PublishedChangeCard[],
  events: readonly EventRecord[],
): readonly PublishedChangeCard[] {
  return cards.filter((card) => awaitingHuman(card, events));
}

/** Convenience: has this card been resolved (approved or rejected) by a human? */
export function isResolved(cardId: string, events: readonly EventRecord[]): boolean {
  return latestDecision(cardId, events) !== null;
}
