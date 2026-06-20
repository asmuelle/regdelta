import { describe, expect, it } from 'vitest';
import { hasChanges } from '@regdelta/core';
import { detectDelta } from './detect';
import { fetchEcfrSection, snapshotFromFetch } from './ingest';
import { ecfrTitle12Section102640Source } from './sources';

const prior = snapshotFromFetch(
  fetchEcfrSection(ecfrTitle12Section102640Source, 'prior'),
  'snap-prior',
);
const current = snapshotFromFetch(
  fetchEcfrSection(ecfrTitle12Section102640Source, 'current'),
  'snap-current',
);

describe('detectDelta', () => {
  it('returns null when the content hash is unchanged (heartbeat, no delta)', () => {
    // Arrange: same content under a different snapshot id
    const refetched = { ...prior, id: 'snap-prior-refetch', fetchedAt: '2026-06-11T05:00:00.000Z' };

    // Act
    const delta = detectDelta({
      id: 'delta-x',
      prior,
      current: refetched,
      detectedAt: '2026-06-11T05:00:01.000Z',
    });

    // Assert
    expect(delta).toBeNull();
  });

  it('produces an amended delta with a structural diff for changed content', () => {
    // Act
    const delta = detectDelta({
      id: 'delta-y',
      prior,
      current,
      detectedAt: '2026-06-10T05:00:01.000Z',
    });

    // Assert
    expect(delta?.kind).toBe('amended');
    expect(delta?.fromSnapshotId).toBe('snap-prior');
    expect(delta?.toSnapshotId).toBe('snap-current');
    expect(hasChanges(delta?.ops ?? [])).toBe(true);
  });

  it('diffs deterministically: identical inputs yield identical ops (Invariant 3)', () => {
    // Act
    const first = detectDelta({ id: 'd', prior, current, detectedAt: 't' });
    const second = detectDelta({ id: 'd', prior, current, detectedAt: 't' });

    // Assert
    expect(first).toEqual(second);
  });

  it('captures the amendment as paired delete/insert ops over the changed sentence', () => {
    // Act
    const delta = detectDelta({ id: 'd', prior, current, detectedAt: 't' });
    const deletes = (delta?.ops ?? []).filter((op) => op.kind === 'delete').map((op) => op.text);
    const inserts = (delta?.ops ?? []).filter((op) => op.kind === 'insert').map((op) => op.text);

    // Assert — classic blackline: old timing rule out, application-receipt rule in.
    expect(deletes.join(' ')).toContain('at the time an application is provided to the consumer');
    expect(inserts.join(' ')).toContain('not later than three business days');
  });

  it('marks a first-ever snapshot as a new_document delta', () => {
    // Act
    const delta = detectDelta({ id: 'd-new', prior: null, current, detectedAt: 't' });

    // Assert
    expect(delta?.kind).toBe('new_document');
    expect(delta?.fromSnapshotId).toBeNull();
    expect(delta?.ops.every((op) => op.kind === 'insert')).toBe(true);
  });
});
