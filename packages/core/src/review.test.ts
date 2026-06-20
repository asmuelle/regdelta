import { describe, expect, it } from 'vitest';
import { appendEvent } from './events';
import { isResolved, projectReviewState, reviewQueue } from './review';
import { recordHumanDecision } from './triage';
import type { EventRecord, PublishedChangeCard } from './types';

function makeCard(overrides: Partial<PublishedChangeCard> = {}): PublishedChangeCard {
  return {
    id: 'card-1',
    deltaId: 'delta-1',
    companyId: 'co-1',
    title: 't',
    summary: 's',
    requiredAction: 'review and confirm applicability — decision support',
    affectedProducts: ['p'],
    effectiveDate: 'none_stated',
    deadline: null,
    materiality: 'normal',
    redline: [],
    claims: [],
    reviewState: 'pending_review',
    publishedAt: null,
    ...overrides,
  };
}

function approve(cardId: string, at: string): EventRecord[] {
  return appendEvent(
    [],
    recordHumanDecision({
      actorType: 'human',
      actorId: 'reviewer@example.com',
      kind: 'approve_card',
      subjectId: cardId,
      reason: 'verified against source',
    }),
    at,
  );
}

describe('projectReviewState (Invariants 6/7)', () => {
  it('publishes a held card on human approval, stamping publishedAt from the decision', () => {
    const card = makeCard();
    const events = approve('card-1', '2026-06-20T09:00:00.000Z');
    const projected = projectReviewState(card, events);
    expect(projected.reviewState).toBe('approved');
    expect(projected.publishedAt).toBe('2026-06-20T09:00:00.000Z');
  });

  it('un-publishes a card on human rejection', () => {
    const card = makeCard({ reviewState: 'auto', publishedAt: '2026-06-10T06:00:00.000Z' });
    const events = appendEvent(
      [],
      recordHumanDecision({
        actorType: 'human',
        actorId: 'reviewer@example.com',
        kind: 'reject_card',
        subjectId: 'card-1',
        reason: 'misread the effective date',
      }),
      '2026-06-20T09:00:00.000Z',
    );
    const projected = projectReviewState(card, events);
    expect(projected.reviewState).toBe('rejected');
    expect(projected.publishedAt).toBeNull();
  });

  it('leaves a card unchanged when no human decision exists', () => {
    const card = makeCard();
    expect(projectReviewState(card, [])).toEqual(card);
  });
});

describe('reviewQueue', () => {
  it('queues a gate-failed (pending_review) card until a human resolves it', () => {
    const card = makeCard();
    expect(reviewQueue([card], [])).toHaveLength(1);
    expect(reviewQueue([card], approve('card-1', '2026-06-20T09:00:00.000Z'))).toHaveLength(0);
  });

  it('keeps an auto-published high-materiality card in the queue until approved (Invariant 7)', () => {
    const highAuto = makeCard({
      materiality: 'high',
      reviewState: 'auto',
      publishedAt: '2026-06-10T06:00:00.000Z',
    });
    expect(reviewQueue([highAuto], [])).toHaveLength(1);
    expect(reviewQueue([highAuto], approve('card-1', '2026-06-20T09:00:00.000Z'))).toHaveLength(0);
  });

  it('does not queue a normal-materiality auto-published card', () => {
    const normalAuto = makeCard({
      materiality: 'normal',
      reviewState: 'auto',
      publishedAt: '2026-06-10T06:00:00.000Z',
    });
    expect(reviewQueue([normalAuto], [])).toHaveLength(0);
  });

  it('reports resolution status from the log', () => {
    expect(isResolved('card-1', [])).toBe(false);
    expect(isResolved('card-1', approve('card-1', '2026-06-20T09:00:00.000Z'))).toBe(true);
  });
});
