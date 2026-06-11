import { InvariantViolationError } from './errors';
import type { ActorType } from './types';

export const DEFAULT_TRIAGE_THRESHOLD = 0.35;

/**
 * Recall safety margin: borderline scores pass through to synthesis because a
 * false negative (missed applicable change) is the fatal error class
 * (DESIGN.md Risk 1). False positives are filtered downstream by the gate
 * and the review queue.
 */
export const RECALL_SAFETY_MARGIN = 0.1;

export function decideTriage(
  confidence: number,
  threshold: number = DEFAULT_TRIAGE_THRESHOLD,
): 'relevant' | 'irrelevant' {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RangeError(`decideTriage: confidence ${confidence} outside [0, 1]`);
  }
  return confidence >= threshold - RECALL_SAFETY_MARGIN ? 'relevant' : 'irrelevant';
}

export type HumanDecisionKind = 'dismiss_delta' | 'approve_card' | 'reject_card';

export interface HumanDecisionInput {
  readonly actorType: ActorType;
  readonly actorId: string;
  readonly kind: HumanDecisionKind;
  readonly subjectId: string;
  readonly reason: string;
}

export interface HumanDecision {
  readonly eventType: 'human_decision';
  readonly actorType: 'human';
  readonly actorId: string;
  readonly payload: {
    readonly kind: HumanDecisionKind;
    readonly subjectId: string;
    readonly reason: string;
  };
}

/**
 * Invariants 6 and 7: only a logged HUMAN action can dismiss a delta as
 * not-applicable or approve/reject a card. There is no code path that lets a
 * model or the system record these decisions.
 */
export function recordHumanDecision(input: HumanDecisionInput): HumanDecision {
  if (input.actorType !== 'human') {
    throw new InvariantViolationError(
      'INV6_HUMAN_ONLY',
      `actor type "${input.actorType}" may not record "${input.kind}" — ` +
        'only a logged human action can (AGENTS.md Invariants 6/7)',
    );
  }
  return {
    eventType: 'human_decision',
    actorType: 'human',
    actorId: input.actorId,
    payload: { kind: input.kind, subjectId: input.subjectId, reason: input.reason },
  };
}
