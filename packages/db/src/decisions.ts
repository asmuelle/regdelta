/**
 * Human-decision write path (Invariants 4/6). Approve/reject/dismiss are recorded
 * as hash-chained `human_decision` events appended onto the persisted log — the
 * only way a card or delta is resolved. The actor must be human (enforced by
 * core's recordHumanDecision); the new event chains onto the current tail and is
 * inserted into the append-only events table.
 */
import { appendEvent, recordHumanDecision, type EventRecord } from '@regdelta/core';
import type { HumanDecisionKind } from '@regdelta/core';
import type { DbClient } from './client';
import { EventRepository } from './repository';

export interface ReviewDecisionInput {
  /** Reviewer identity recorded on the event (no model/system actor permitted). */
  readonly actorId: string;
  readonly kind: HumanDecisionKind;
  /** Card id (approve/reject) or delta id (dismiss). */
  readonly subjectId: string;
  readonly reason: string;
  /** ISO timestamp for the event; pass an explicit clock value, never Date.now in tests. */
  readonly occurredAt: string;
}

/**
 * Record a human decision: load the current chain, append the decision event onto
 * its tail, and persist the new event. Returns the appended event.
 *
 * Note: load-then-append is not concurrency-safe under simultaneous writers — two
 * racing decisions compute the same next seq and the second is rejected by the
 * events primary key (fail-closed, never corrupt). A future revision takes a
 * transaction-scoped lock; today's single-reviewer flow does not need it.
 */
export async function recordReviewDecision(
  client: DbClient,
  input: ReviewDecisionInput,
): Promise<EventRecord> {
  const repo = new EventRepository(client);
  const existing = await repo.all();
  const decision = recordHumanDecision({
    actorType: 'human',
    actorId: input.actorId,
    kind: input.kind,
    subjectId: input.subjectId,
    reason: input.reason,
  });
  const next = appendEvent(existing, decision, input.occurredAt);
  const appended = next[next.length - 1];
  if (appended === undefined) {
    throw new Error('recordReviewDecision: appendEvent produced no event');
  }
  await repo.append([appended]);
  return appended;
}
