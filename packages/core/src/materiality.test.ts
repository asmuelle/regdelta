import { describe, expect, it } from 'vitest';
import { canDispatchAlert } from './alerts';
import { appendEvent } from './events';
import { evaluateFreshness } from './freshness';
import { scoreMateriality } from './materiality';
import { recordHumanDecision } from './triage';
import type { EventRecord, PublishedChangeCard } from './types';

describe('scoreMateriality', () => {
  it('scores an effective date inside the 30-day window as high', () => {
    expect(
      scoreMateriality({ effectiveDate: '2026-06-25', now: '2026-06-10', text: 'routine' }),
    ).toBe('high');
  });

  it('scores a distant effective date as normal', () => {
    expect(
      scoreMateriality({ effectiveDate: '2026-10-01', now: '2026-06-10', text: 'routine' }),
    ).toBe('normal');
  });

  it('scores high-signal enforcement language as high regardless of date', () => {
    expect(
      scoreMateriality({
        effectiveDate: 'none_stated',
        now: '2026-06-10',
        text: 'The order is effective immediately.',
      }),
    ).toBe('high');
  });
});

function makeCard(overrides: Partial<PublishedChangeCard>): PublishedChangeCard {
  return {
    id: 'card-7',
    deltaId: 'delta-7',
    companyId: 'co-7',
    title: 't',
    summary: 's',
    requiredAction: 'r',
    affectedProducts: ['p'],
    effectiveDate: 'none_stated',
    deadline: null,
    materiality: 'high',
    redline: [],
    claims: [],
    reviewState: 'pending_review',
    publishedAt: '2026-06-10T06:00:10.000Z',
    ...overrides,
  };
}

describe('canDispatchAlert (Invariant 7)', () => {
  it('refuses to alert on a high-materiality card without a human approval event', () => {
    expect(canDispatchAlert(makeCard({}), [])).toBe(false);
  });

  it('allows alerting once a human approval event for that card exists', () => {
    // Arrange
    const approval = recordHumanDecision({
      actorType: 'human',
      actorId: 'reviewer@example.com',
      kind: 'approve_card',
      subjectId: 'card-7',
      reason: 'verified against source',
    });
    const events: EventRecord[] = appendEvent([], approval, '2026-06-10T07:00:00.000Z');

    // Act & Assert
    expect(canDispatchAlert(makeCard({}), events)).toBe(true);
  });

  it('never alerts on an unpublished card', () => {
    expect(canDispatchAlert(makeCard({ publishedAt: null, materiality: 'normal' }), [])).toBe(
      false,
    );
  });

  it('allows normal-materiality published cards without approval', () => {
    expect(canDispatchAlert(makeCard({ materiality: 'normal' }), [])).toBe(true);
  });
});

describe('evaluateFreshness (Invariant 5)', () => {
  it('flags a source as degraded after a simulated 3-day crawl outage against a 36h SLA', () => {
    expect(
      evaluateFreshness({
        lastSuccessAt: '2026-06-07T06:00:00.000Z',
        now: '2026-06-10T06:00:00.000Z',
        freshnessSlaHours: 36,
      }),
    ).toBe('degraded');
  });

  it('keeps a recently crawled source fresh', () => {
    expect(
      evaluateFreshness({
        lastSuccessAt: '2026-06-10T01:00:00.000Z',
        now: '2026-06-10T06:00:00.000Z',
        freshnessSlaHours: 36,
      }),
    ).toBe('fresh');
  });
});
