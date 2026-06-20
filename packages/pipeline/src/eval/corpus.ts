/**
 * Hand-labeled eval corpus for the model stages with clear ground truth: topic
 * classification (recall — every expected topic must be caught) and entailment
 * (the safety property — a claim NOT supported by its quote must be rejected,
 * including a fabrication trap). Run against the deterministic mocks in CI for a
 * wiring baseline, and against live Anthropic ports via `just eval:live` for the
 * real measurement (DESIGN.md M2). Grow with a compliance SME as scope widens.
 */
import { sha256Hex, type SnapshotRecord } from '@regdelta/core';

export interface TopicEvalCase {
  readonly id: string;
  readonly deltaText: string;
  readonly expectedTopicIds: readonly string[];
}

export interface EntailmentEvalCase {
  readonly id: string;
  readonly snapshot: SnapshotRecord;
  readonly claimText: string;
  readonly quote: string;
  readonly expectedEntailed: boolean;
  readonly note: string;
}

export const TOPIC_EVAL_CORPUS: readonly TopicEvalCase[] = [
  {
    id: 'reg-z-heloc-disclosure',
    deltaText:
      'The Bureau is amending Regulation Z, which implements the Truth in Lending Act, to revise ' +
      'the timing of disclosure for home equity lines of credit (an open-end credit plan).',
    expectedTopicIds: ['topic-reg-z-disclosure'],
  },
  {
    id: 'ca-financing-law-licensing',
    deltaText:
      'The California Financing Law is amended to revise consumer credit licensing requirements ' +
      'and disclosure obligations for licensees.',
    expectedTopicIds: ['topic-ca-financing-law'],
  },
  {
    id: 'off-topic-swaps',
    deltaText:
      'The Commission adopts rules for swap execution facilities and derivatives clearing ' +
      'organizations under the Commodity Exchange Act.',
    expectedTopicIds: [],
  },
];

function snapshotOf(id: string, text: string): SnapshotRecord {
  return {
    id,
    sourceId: 'src-eval',
    url: 'https://www.federalregister.gov/eval',
    fetchedAt: '2026-06-10T06:00:00.000Z',
    contentHash: sha256Hex(text),
    normalizedText: text,
  };
}

const SUPPORTING_TEXT =
  'The final rule requires creditors to deliver the home equity brochure not later than three ' +
  'business days after the creditor receives the application. The rule is effective October 1, 2026.';
const evalSnapshot = snapshotOf('snap-eval-1', SUPPORTING_TEXT);

export const ENTAILMENT_EVAL_CORPUS: readonly EntailmentEvalCase[] = [
  {
    id: 'entailed-delivery-timing',
    snapshot: evalSnapshot,
    claimText: 'Creditors must deliver the home equity brochure within three business days.',
    quote:
      'requires creditors to deliver the home equity brochure not later than three business days',
    expectedEntailed: true,
    note: 'claim is fully supported by the quoted span',
  },
  {
    id: 'entailed-effective-date',
    snapshot: evalSnapshot,
    claimText: 'The rule is effective October 1, 2026.',
    quote: 'The rule is effective October 1, 2026.',
    expectedEntailed: true,
    note: 'verbatim supported claim',
  },
  {
    id: 'unsupported-penalty-claim',
    snapshot: evalSnapshot,
    claimText: 'Violations carry a civil money penalty of $5,000 per occurrence.',
    quote: 'The rule is effective October 1, 2026.',
    expectedEntailed: false,
    note: 'quote present but does not support the penalty claim — must be rejected',
  },
  {
    id: 'fabricated-quote-trap',
    snapshot: evalSnapshot,
    claimText: 'The rule requires biometric identity verification at application.',
    quote: 'creditors must collect a fingerprint scan before accepting an application',
    expectedEntailed: false,
    note: 'fabricated quote absent from the snapshot — the safety trap',
  },
];
