import { describe, expect, it } from 'vitest';
import { resolveCitation } from './citations';
import { sha256Hex } from './hash';
import type { Citation, SnapshotRecord } from './types';

const TEXT = 'The disclosures shall be delivered not later than three business days.';

const snapshot: SnapshotRecord = {
  id: 'snap-test',
  sourceId: 'src-test',
  url: 'https://www.ecfr.gov/test',
  fetchedAt: '2026-06-10T06:00:00.000Z',
  contentHash: sha256Hex(TEXT),
  normalizedText: TEXT,
};

const validCitation: Citation = {
  snapshotId: 'snap-test',
  sourceUrl: snapshot.url,
  snapshotContentHash: snapshot.contentHash,
  charStart: 0,
  charEnd: TEXT.length,
  quotedText: TEXT,
};

describe('resolveCitation', () => {
  it('resolves a byte-exact span', () => {
    expect(resolveCitation(validCitation, snapshot)).toEqual({ resolved: true });
  });

  it('fails when a single character of the quoted span is altered', () => {
    // Arrange — "three" tampered to "thre3"
    const tampered = { ...validCitation, quotedText: TEXT.replace('three', 'thre3') };

    // Act
    const result = resolveCitation(tampered, snapshot);

    // Assert
    expect(result.resolved).toBe(false);
  });

  it('fails on out-of-range offsets', () => {
    const result = resolveCitation({ ...validCitation, charEnd: TEXT.length + 10 }, snapshot);
    expect(result.resolved).toBe(false);
  });

  it('fails when the snapshot is missing', () => {
    const result = resolveCitation(validCitation, undefined);
    expect(result.resolved).toBe(false);
  });

  it('fails when the snapshot content hash does not match the pinned hash', () => {
    const stale = { ...validCitation, snapshotContentHash: sha256Hex('different content') };
    expect(resolveCitation(stale, snapshot).resolved).toBe(false);
  });
});
