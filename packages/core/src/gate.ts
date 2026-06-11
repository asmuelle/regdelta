import { resolveCitation } from './citations';
import { findForbiddenPhrases } from './copy';
import { isValidIsoDate } from './dates';
import { validateChangeCardDraft } from './validation';
import {
  NONE_STATED,
  type ChangeCardDraft,
  type EntailmentVerdict,
  type GateCheck,
  type GateResult,
  type SnapshotRecord,
} from './types';

export interface GateInput {
  readonly card: ChangeCardDraft;
  readonly snapshots: ReadonlyMap<string, SnapshotRecord>;
  readonly verdicts: readonly EntailmentVerdict[];
}

/**
 * The entailment gate (Invariant 2). Fronts EVERY publish; there is no bypass
 * parameter by design. Any failed check routes the card to the review queue.
 */
export function evaluateGate({ card, snapshots, verdicts }: GateInput): GateResult {
  const checks: GateCheck[] = [
    checkProvenance(card),
    checkCitationsResolve(card, snapshots),
    checkDatesParse(card),
    checkDecisionSupportLanguage(card),
    checkEntailment(card, verdicts),
  ];
  const failed = checks.filter((check) => !check.passed);
  if (failed.length > 0) {
    return { status: 'fail', route: 'review_queue', checks };
  }
  return { status: 'pass', route: 'publish', checks };
}

function checkProvenance(card: ChangeCardDraft): GateCheck {
  const result = validateChangeCardDraft(card);
  return {
    code: 'provenance_complete',
    passed: result.valid,
    detail: result.valid ? 'all provenance fields present' : result.issues.join('; '),
  };
}

function checkCitationsResolve(
  card: ChangeCardDraft,
  snapshots: ReadonlyMap<string, SnapshotRecord>,
): GateCheck {
  const failures = card.claims.flatMap((claim, index) => {
    const resolution = resolveCitation(claim.citation, snapshots.get(claim.citation.snapshotId));
    return resolution.resolved ? [] : [`claim ${index}: ${resolution.reason}`];
  });
  return {
    code: 'citations_resolve',
    passed: failures.length === 0,
    detail:
      failures.length === 0
        ? `${card.claims.length} citation(s) resolve byte-exact against stored snapshots`
        : failures.join('; '),
  };
}

function checkDatesParse(card: ChangeCardDraft): GateCheck {
  const failures: string[] = [];
  if (card.effectiveDate !== NONE_STATED && !isValidIsoDate(card.effectiveDate)) {
    failures.push(`effectiveDate "${card.effectiveDate}" does not parse`);
  }
  if (card.deadline !== null && !isValidIsoDate(card.deadline)) {
    failures.push(`deadline "${card.deadline}" does not parse`);
  }
  return {
    code: 'dates_parse',
    passed: failures.length === 0,
    detail: failures.length === 0 ? 'all dates parse as ISO calendar dates' : failures.join('; '),
  };
}

function checkDecisionSupportLanguage(card: ChangeCardDraft): GateCheck {
  const found = [
    ...findForbiddenPhrases(card.summary),
    ...findForbiddenPhrases(card.requiredAction),
  ];
  return {
    code: 'decision_support_language',
    passed: found.length === 0,
    detail:
      found.length === 0
        ? 'no legal-conclusion phrasing detected'
        : `forbidden legal-conclusion phrasing: ${[...new Set(found)].join(', ')} (Invariant 6)`,
  };
}

function checkEntailment(card: ChangeCardDraft, verdicts: readonly EntailmentVerdict[]): GateCheck {
  if (verdicts.length !== card.claims.length) {
    return {
      code: 'entailment',
      passed: false,
      detail: `expected ${card.claims.length} verdict(s), got ${verdicts.length}`,
    };
  }
  const failed = verdicts.filter((verdict) => !verdict.entailed);
  return {
    code: 'entailment',
    passed: failed.length === 0,
    detail:
      failed.length === 0
        ? 'every claim entailed by its cited text'
        : failed.map((v) => `claim ${v.claimIndex}: ${v.rationale}`).join('; '),
  };
}
