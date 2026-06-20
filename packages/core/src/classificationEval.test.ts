import { describe, expect, it } from 'vitest';
import { evaluateBinaryOutcomes } from './classificationEval';

describe('evaluateBinaryOutcomes', () => {
  it('computes recall, precision, and lists misses and false alarms', () => {
    const result = evaluateBinaryOutcomes([
      { id: 'a', predicted: true, expected: true }, // TP
      { id: 'b', predicted: false, expected: true }, // FN (miss)
      { id: 'c', predicted: true, expected: false }, // FP (false alarm)
      { id: 'd', predicted: false, expected: false }, // TN
    ]);
    expect(result.recall).toBe(0.5);
    expect(result.precision).toBe(0.5);
    expect(result.misses).toEqual(['b']);
    expect(result.falseAlarms).toEqual(['c']);
  });

  it('scores a perfect classifier as recall 1, precision 1', () => {
    const result = evaluateBinaryOutcomes([
      { id: 'a', predicted: true, expected: true },
      { id: 'b', predicted: false, expected: false },
    ]);
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
  });
});
