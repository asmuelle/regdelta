/**
 * Eval runners: drive a set of model ports (mock or live) through the corpus and
 * score with the generic core scorer. Port-agnostic by design — the SAME runner
 * measures the deterministic mocks (CI wiring baseline) and the live Anthropic
 * ports (`just eval:live`, real numbers).
 */
import {
  evaluateBinaryOutcomes,
  type BinaryOutcome,
  type ClassificationEvalResult,
  type Claim,
  type RegTopic,
  type SnapshotRecord,
} from '@regdelta/core';
import type { ModelPorts } from '../ports';
import {
  ENTAILMENT_EVAL_CORPUS,
  TOPIC_EVAL_CORPUS,
  type EntailmentEvalCase,
  type TopicEvalCase,
} from './corpus';

export interface EntailmentEvalReport {
  readonly result: ClassificationEvalResult;
  /** True when NO unsupported/fabricated claim was accepted as entailed (the safety bar). */
  readonly unsupportedAllRejected: boolean;
  readonly leakedClaimIds: readonly string[];
}

/** Topic recall/precision over every (delta × topic) pair in the corpus. */
export async function runTopicClassifierEval(
  ports: ModelPorts,
  topics: readonly RegTopic[],
  corpus: readonly TopicEvalCase[] = TOPIC_EVAL_CORPUS,
): Promise<ClassificationEvalResult> {
  const outcomes: BinaryOutcome[] = [];
  for (const testCase of corpus) {
    const { assignments } = await ports.topicClassifier.classify({
      deltaText: testCase.deltaText,
      topics,
    });
    const assigned = new Set(assignments.map((assignment) => assignment.topicId));
    const expected = new Set(testCase.expectedTopicIds);
    for (const topic of topics) {
      outcomes.push({
        id: `${testCase.id}:${topic.id}`,
        predicted: assigned.has(topic.id),
        expected: expected.has(topic.id),
      });
    }
  }
  return evaluateBinaryOutcomes(outcomes);
}

/** Entailment accuracy plus the safety check that no unsupported claim is accepted. */
export async function runEntailmentEval(
  ports: ModelPorts,
  corpus: readonly EntailmentEvalCase[] = ENTAILMENT_EVAL_CORPUS,
): Promise<EntailmentEvalReport> {
  const outcomes: BinaryOutcome[] = [];
  const leakedClaimIds: string[] = [];
  for (const testCase of corpus) {
    const claim = claimFor(testCase);
    const snapshots = new Map<string, SnapshotRecord>([[testCase.snapshot.id, testCase.snapshot]]);
    const [verdict] = await ports.entailment.verify({ claims: [claim], snapshots });
    const predicted = verdict?.entailed ?? false;
    outcomes.push({ id: testCase.id, predicted, expected: testCase.expectedEntailed });
    if (!testCase.expectedEntailed && predicted) {
      leakedClaimIds.push(testCase.id);
    }
  }
  return {
    result: evaluateBinaryOutcomes(outcomes),
    unsupportedAllRejected: leakedClaimIds.length === 0,
    leakedClaimIds,
  };
}

function claimFor(testCase: EntailmentEvalCase): Claim {
  return {
    text: testCase.claimText,
    citation: {
      snapshotId: testCase.snapshot.id,
      sourceUrl: testCase.snapshot.url,
      snapshotContentHash: testCase.snapshot.contentHash,
      charStart: 0,
      charEnd: testCase.quote.length,
      quotedText: testCase.quote,
    },
  };
}
