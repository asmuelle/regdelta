import { describe, expect, it } from 'vitest';
import { InvariantViolationError } from './errors';
import {
  DEFAULT_TRIAGE_THRESHOLD,
  RECALL_SAFETY_MARGIN,
  decideTriage,
  recordHumanDecision,
} from './triage';

describe('decideTriage', () => {
  it('routes confident scores to relevant', () => {
    expect(decideTriage(0.9)).toBe('relevant');
  });

  it('routes clearly low scores to irrelevant', () => {
    expect(decideTriage(0.05)).toBe('irrelevant');
  });

  it('passes borderline scores through in favor of recall (false negatives are fatal)', () => {
    // Arrange — just below the nominal threshold, inside the recall margin
    const borderline = DEFAULT_TRIAGE_THRESHOLD - RECALL_SAFETY_MARGIN / 2;

    // Act & Assert
    expect(decideTriage(borderline)).toBe('relevant');
  });

  it('rejects confidence values outside [0, 1]', () => {
    expect(() => decideTriage(1.5)).toThrow(RangeError);
    expect(() => decideTriage(Number.NaN)).toThrow(RangeError);
  });
});

describe('recordHumanDecision (Invariants 6/7)', () => {
  it('throws when a model actor tries to dismiss a delta as not applicable', () => {
    expect(() =>
      recordHumanDecision({
        actorType: 'model',
        actorId: 'triage-mock',
        kind: 'dismiss_delta',
        subjectId: 'delta-1',
        reason: 'low confidence',
      }),
    ).toThrow(InvariantViolationError);
  });

  it('throws when the system actor tries to approve a card', () => {
    expect(() =>
      recordHumanDecision({
        actorType: 'system',
        actorId: 'pipeline',
        kind: 'approve_card',
        subjectId: 'card-1',
        reason: 'auto',
      }),
    ).toThrow(InvariantViolationError);
  });

  it('records a human dismissal with full actor identity', () => {
    // Act
    const decision = recordHumanDecision({
      actorType: 'human',
      actorId: 'reviewer@example.com',
      kind: 'dismiss_delta',
      subjectId: 'delta-1',
      reason: 'out of scope for this profile',
    });

    // Assert
    expect(decision.eventType).toBe('human_decision');
    expect(decision.actorType).toBe('human');
    expect(decision.payload.kind).toBe('dismiss_delta');
    expect(decision.payload.subjectId).toBe('delta-1');
  });
});
