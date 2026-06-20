import { segmentText, type Claim, NONE_STATED } from '@regdelta/core';
import { pinQuote, PinError } from './pin';
import { sharedTokenCount, tokenCoverage } from './textUtils';
import type {
  EntailmentInput,
  EntailmentVerifierPort,
  ModelPorts,
  SynthesisInput,
  SynthesisModelPort,
  SynthesisOutput,
  TopicClassifierInput,
  TopicClassifierOutput,
  TopicClassifierPort,
  TriageInput,
  TriageModelPort,
  TriageOutput,
} from './ports';
import type { EntailmentVerdict, SnapshotRecord, TopicAssignment } from '@regdelta/core';

export class SynthesisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SynthesisError';
  }
}

const CONFIDENCE_DECIMALS = 2;
const ENTAILMENT_COVERAGE_THRESHOLD = 0.5;
const MIN_PRODUCT_TOKEN_MATCHES = 2;
const MAX_AMENDMENT_CLAIMS = 3;
const REQUIREMENT_PATTERN = /\brule (?:requires|amends)\b/i;
const EFFECTIVE_PATTERN = /\bis effective\b/i;

/**
 * Deterministic topic classification: keyword overlap between the delta text and
 * each topic. Recall-biased — any single keyword match assigns the topic, so a
 * downstream profile can never miss a plausibly-relevant change. Runs once per
 * delta; the per-profile mapping is pure set math in @regdelta/core.
 */
export const deterministicTopicClassifier: TopicClassifierPort = {
  label: 'deterministic-topic-classifier-mock',
  classify(input: TopicClassifierInput): Promise<TopicClassifierOutput> {
    const text = input.deltaText.toLowerCase();
    const assignments: TopicAssignment[] = [];
    for (const topic of input.topics) {
      const matchedKeywords = topic.keywords.filter((keyword) =>
        text.includes(keyword.toLowerCase()),
      );
      if (matchedKeywords.length === 0) {
        continue;
      }
      const confidence = Number(
        (matchedKeywords.length / topic.keywords.length).toFixed(CONFIDENCE_DECIMALS),
      );
      assignments.push({ topicId: topic.id, confidence, matchedKeywords });
    }
    return Promise.resolve({ assignments });
  },
};

/** Deterministic triage: watch-term overlap against the delta text. */
export const deterministicTriage: TriageModelPort = {
  label: 'deterministic-triage-mock',
  assess(input: TriageInput): Promise<TriageOutput> {
    const text = input.deltaText.toLowerCase();
    const terms = input.profile.watchTerms;
    const matched = terms.filter((term) => text.includes(term.toLowerCase()));
    const raw = terms.length === 0 ? 0 : matched.length / terms.length;
    const confidence = Number(raw.toFixed(CONFIDENCE_DECIMALS));
    const rationale =
      matched.length > 0 ? `matched watch terms: ${matched.join(', ')}` : 'no watch terms matched';
    return Promise.resolve({ confidence, rationale });
  },
};

function pinClaim(snapshot: SnapshotRecord, sentence: string): Claim {
  try {
    return pinQuote(snapshot, sentence);
  } catch (error: unknown) {
    if (error instanceof PinError) {
      throw new SynthesisError(error.message);
    }
    throw error;
  }
}

function noticeClaims(input: SynthesisInput): Claim[] {
  const sentences = segmentText(input.notice.snapshot.normalizedText);
  const requirement = sentences.find((s) => REQUIREMENT_PATTERN.test(s));
  const effective = sentences.find((s) => EFFECTIVE_PATTERN.test(s));
  return [requirement, effective]
    .filter((s): s is string => s !== undefined)
    .map((s) => pinClaim(input.notice.snapshot, s));
}

function amendmentClaims(input: SynthesisInput): Claim[] {
  if (input.amendment === null) {
    return [];
  }
  const { snapshot, insertedSegments } = input.amendment;
  return insertedSegments
    .slice(0, MAX_AMENDMENT_CLAIMS)
    .map((segment) => pinClaim(snapshot, segment));
}

function affectedProducts(input: SynthesisInput, claims: readonly Claim[]): string[] {
  if (input.profile.products.length === 0) {
    throw new SynthesisError('company profile has no products — cannot scope a change card');
  }
  const claimText = claims.map((claim) => claim.text).join(' ');
  const matched = input.profile.products.filter(
    (product) => sharedTokenCount(product, claimText) >= MIN_PRODUCT_TOKEN_MATCHES,
  );
  return matched.length > 0 ? matched : [input.profile.products[0] as string];
}

/**
 * Deterministic synthesis: extracts requirement/effective-date sentences and
 * inserted rule text, pinning every claim byte-exact into stored snapshots.
 * Copy is decision-support phrasing by construction (Invariant 6).
 */
export const deterministicSynthesis: SynthesisModelPort = {
  label: 'deterministic-synthesis-mock',
  draft(input: SynthesisInput): Promise<SynthesisOutput> {
    const claims = [...noticeClaims(input), ...amendmentClaims(input)];
    if (claims.length === 0) {
      throw new SynthesisError('no pinnable claims found in source snapshots');
    }
    const primary = claims[0] as Claim;
    const sectionNote =
      input.amendment !== null ? ` Amended text: ${input.amendment.sectionCitation}.` : '';
    return Promise.resolve({
      title: input.notice.title,
      summary: `${input.notice.documentNumber}: ${primary.text}${sectionNote}`,
      requiredAction:
        `The rule text requires: "${primary.text}" ` +
        'Review the pinned citations and confirm applicability for your products — decision support, not legal judgment.',
      affectedProducts: affectedProducts(input, claims),
      effectiveDate: input.notice.effectiveOn ?? NONE_STATED,
      deadline: null,
      claims,
    });
  },
};

/** Deterministic entailment: quoted span must exist and cover the claim's tokens. */
export const deterministicEntailment: EntailmentVerifierPort = {
  label: 'deterministic-entailment-mock',
  verify(input: EntailmentInput): Promise<EntailmentVerdict[]> {
    const verdicts = input.claims.map((claim, claimIndex) => {
      const snapshot = input.snapshots.get(claim.citation.snapshotId);
      if (snapshot === undefined) {
        return { claimIndex, entailed: false, rationale: 'cited snapshot not found' };
      }
      if (!snapshot.normalizedText.includes(claim.citation.quotedText)) {
        return { claimIndex, entailed: false, rationale: 'quoted text absent from snapshot' };
      }
      const coverage = tokenCoverage(claim.text, claim.citation.quotedText);
      const entailed = coverage >= ENTAILMENT_COVERAGE_THRESHOLD;
      return {
        claimIndex,
        entailed,
        rationale: `token coverage ${coverage.toFixed(2)} (threshold ${ENTAILMENT_COVERAGE_THRESHOLD})`,
      };
    });
    return Promise.resolve(verdicts);
  },
};

/**
 * Model port factory. M1 NEVER performs network or AI-API calls: with or
 * without ANTHROPIC_API_KEY present, deterministic mocks are returned. The
 * env check exists so the provider label is honest about why (the live
 * adapter lands post-M1 behind these same ports).
 */
export function createModelPorts(env: Record<string, string | undefined> = {}): ModelPorts {
  const hasKey = typeof env['ANTHROPIC_API_KEY'] === 'string' && env['ANTHROPIC_API_KEY'] !== '';
  const provider = hasKey
    ? 'deterministic-mock (ANTHROPIC_API_KEY detected; live model adapter lands post-M1)'
    : 'deterministic-mock';
  return {
    topicClassifier: deterministicTopicClassifier,
    triage: deterministicTriage,
    synthesis: deterministicSynthesis,
    entailment: deterministicEntailment,
    provider,
  };
}
