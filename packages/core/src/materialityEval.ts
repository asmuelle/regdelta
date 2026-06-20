/**
 * Materiality calibration harness (DESIGN.md M2 eval bar).
 *
 * Auto-publish-vs-human-gate and the entire QA margin ride on the `high`
 * materiality label: under-call routes a material change to silent auto-publish;
 * over-call floods the human queue and collapses margin. So materiality is
 * measured, not assumed. This harness scores the deterministic classifier against
 * a hand-labeled corpus and reports recall/precision on the `high` class. The
 * recall bar is the fatal-class guard; the precision floor bounds queue flooding.
 */
import { scoreMateriality, type MaterialityInput } from './materiality';
import type { Materiality } from './types';

/** A material change must NEVER be missed; recall on `high` is the fatal-class bar. */
export const MATERIALITY_RECALL_BAR = 1.0;

/** Floor on `high` precision — bounds how much the human queue can be flooded. */
export const MATERIALITY_PRECISION_FLOOR = 0.6;

export interface MaterialityCase {
  readonly id: string;
  readonly input: MaterialityInput;
  readonly expected: Materiality;
  readonly note: string;
}

export interface MaterialityConfusion {
  readonly truePositive: number;
  readonly falsePositive: number;
  readonly trueNegative: number;
  readonly falseNegative: number;
}

export interface MaterialityFailure {
  readonly id: string;
  readonly expected: Materiality;
  readonly actual: Materiality;
  readonly note: string;
}

export interface MaterialityEvalResult {
  readonly total: number;
  readonly confusion: MaterialityConfusion;
  readonly recallHigh: number;
  readonly precisionHigh: number;
  readonly failures: readonly MaterialityFailure[];
}

/** Score the classifier across a labeled corpus. `high` is the positive class. */
export function evaluateMaterialityCorpus(
  cases: readonly MaterialityCase[],
): MaterialityEvalResult {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  const failures: MaterialityFailure[] = [];

  for (const testCase of cases) {
    const actual = scoreMateriality(testCase.input);
    const expectedHigh = testCase.expected === 'high';
    const actualHigh = actual === 'high';
    if (expectedHigh && actualHigh) truePositive += 1;
    else if (!expectedHigh && actualHigh) falsePositive += 1;
    else if (!expectedHigh && !actualHigh) trueNegative += 1;
    else falseNegative += 1;
    if (actual !== testCase.expected) {
      failures.push({ id: testCase.id, expected: testCase.expected, actual, note: testCase.note });
    }
  }

  const recallHigh = safeRatio(truePositive, truePositive + falseNegative);
  const precisionHigh = safeRatio(truePositive, truePositive + falsePositive);
  return {
    total: cases.length,
    confusion: { truePositive, falsePositive, trueNegative, falseNegative },
    recallHigh,
    precisionHigh,
    failures,
  };
}

/** Empty positive set scores a perfect 1 — a corpus must include positives to be meaningful. */
function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
