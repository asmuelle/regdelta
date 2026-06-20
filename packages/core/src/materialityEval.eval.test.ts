/**
 * Materiality eval gate. Runs inside `just test` → `just ci`, so any change that
 * regresses recall on material changes BLOCKS the merge. This is the documented
 * M2 promotion criterion in executable form: weaken the classifier and CI fails.
 */
import { describe, expect, it } from 'vitest';
import { MATERIALITY_CORPUS } from './materialityEval.fixtures';
import {
  MATERIALITY_PRECISION_FLOOR,
  MATERIALITY_RECALL_BAR,
  evaluateMaterialityCorpus,
} from './materialityEval';

describe('materiality eval gate (DESIGN.md M2 bar)', () => {
  const result = evaluateMaterialityCorpus(MATERIALITY_CORPUS);

  it('never misses a material change (recall on `high` meets the fatal-class bar)', () => {
    expect(result.failures.filter((f) => f.expected === 'high')).toEqual([]);
    expect(result.recallHigh).toBeGreaterThanOrEqual(MATERIALITY_RECALL_BAR);
  });

  it('keeps the human queue bounded (precision on `high` clears the floor)', () => {
    expect(result.precisionHigh).toBeGreaterThanOrEqual(MATERIALITY_PRECISION_FLOOR);
  });

  it('classifies the whole corpus with zero label mismatches', () => {
    expect(result.failures).toEqual([]);
    expect(result.total).toBe(MATERIALITY_CORPUS.length);
  });

  it('contains both positive and negative cases (a meaningful corpus)', () => {
    const highs = MATERIALITY_CORPUS.filter((c) => c.expected === 'high').length;
    const normals = MATERIALITY_CORPUS.filter((c) => c.expected === 'normal').length;
    expect(highs).toBeGreaterThan(0);
    expect(normals).toBeGreaterThan(0);
  });
});
