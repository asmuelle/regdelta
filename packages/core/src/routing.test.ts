import { describe, expect, it } from 'vitest';
import { InvariantViolationError } from './errors';
import { applyEmbeddingRanking, assertNoDrop, selectClassificationQueue } from './routing';
import type { CompanyProfile } from './types';

const profile: CompanyProfile = {
  id: 'co-1',
  name: 'Meridian',
  vertical: 'consumer_lending',
  products: ['HELOC'],
  jurisdictions: ['US-FED', 'US-CA'],
  licenseTypes: [],
  watchTerms: ['disclosure'],
};

describe('selectClassificationQueue (every in-jurisdiction delta is classified)', () => {
  it('includes federal deltas for any profile', () => {
    const queue = selectClassificationQueue([{ deltaId: 'd1', jurisdiction: 'US-FED' }], [profile]);
    expect(queue).toEqual(['d1']);
  });

  it('includes in-state deltas and excludes out-of-state ones', () => {
    const queue = selectClassificationQueue(
      [
        { deltaId: 'd-ca', jurisdiction: 'US-CA' },
        { deltaId: 'd-ny', jurisdiction: 'US-NY' },
      ],
      [profile],
    );
    expect(queue).toEqual(['d-ca']);
  });
});

describe('applyEmbeddingRanking (embeddings rank, never filter — Invariant 3)', () => {
  it('retains a delta with a low/zero embedding score (no silent drop)', () => {
    // Arrange — d-low scores far below d-high but must survive ranking.
    const scores = new Map([
      ['d-high', 0.95],
      ['d-low', 0.01],
    ]);

    // Act
    const ranked = applyEmbeddingRanking(['d-low', 'd-high'], scores);

    // Assert — reordered by score, but BOTH present.
    expect(ranked).toEqual(['d-high', 'd-low']);
  });

  it('keeps a delta that has no embedding score at all (sorted last, never dropped)', () => {
    const ranked = applyEmbeddingRanking(['a', 'b'], new Map([['a', 0.9]]));
    expect(new Set(ranked)).toEqual(new Set(['a', 'b']));
    expect(ranked).toHaveLength(2);
  });

  it('breaks ties deterministically by delta id', () => {
    const ranked = applyEmbeddingRanking(['b', 'a'], new Map());
    expect(ranked).toEqual(['a', 'b']);
  });

  it('throws if a ranking ever drops a delta from the queue', () => {
    expect(() => assertNoDrop(['a', 'b'], ['a'])).toThrow(InvariantViolationError);
  });
});
