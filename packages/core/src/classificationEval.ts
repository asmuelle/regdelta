/**
 * Generic binary-classification scoring (DESIGN.md M2 eval bar), reused by the
 * topic-classifier and entailment evals. Each item carries a predicted boolean
 * and an expected boolean; we report recall (the fatal-class guard for "did we
 * catch the positives") and precision (the bound on over-flagging). Same shape
 * as `materialityEval`, generalized so any stage can be measured the same way.
 */

export interface BinaryOutcome {
  readonly id: string;
  readonly predicted: boolean;
  readonly expected: boolean;
}

export interface ClassificationConfusion {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly trueNegative: number;
  readonly falseNegative: number;
}

export interface ClassificationEvalResult {
  readonly total: number;
  readonly confusion: ClassificationConfusion;
  readonly recall: number;
  readonly precision: number;
  /** Ids of items the classifier got wrong, for triage of regressions. */
  readonly misses: readonly string[];
  readonly falseAlarms: readonly string[];
}

export function evaluateBinaryOutcomes(
  outcomes: readonly BinaryOutcome[],
): ClassificationEvalResult {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  const misses: string[] = [];
  const falseAlarms: string[] = [];

  for (const outcome of outcomes) {
    if (outcome.expected && outcome.predicted) truePositive += 1;
    else if (!outcome.expected && outcome.predicted) {
      falsePositive += 1;
      falseAlarms.push(outcome.id);
    } else if (!outcome.expected && !outcome.predicted) trueNegative += 1;
    else {
      falseNegative += 1;
      misses.push(outcome.id);
    }
  }

  return {
    total: outcomes.length,
    confusion: { truePositive, falsePositive, trueNegative, falseNegative },
    recall: safeRatio(truePositive, truePositive + falseNegative),
    precision: safeRatio(truePositive, truePositive + falsePositive),
    misses,
    falseAlarms,
  };
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
