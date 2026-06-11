import { diffTexts, hasChanges, type DeltaRecord, type SnapshotRecord } from '@regdelta/core';

export interface DetectInput {
  readonly id: string;
  readonly prior: SnapshotRecord | null;
  readonly current: SnapshotRecord;
  readonly detectedAt: string;
}

/**
 * Deterministic change detection (Invariant 3): content-hash compare plus
 * structural diff. No model is ever consulted here; identical inputs always
 * produce identical deltas. Returns null when the content hash is unchanged
 * (freshness heartbeat, no delta).
 */
export function detectDelta({ id, prior, current, detectedAt }: DetectInput): DeltaRecord | null {
  if (prior === null) {
    return {
      id,
      sourceId: current.sourceId,
      kind: 'new_document',
      fromSnapshotId: null,
      toSnapshotId: current.id,
      ops: diffTexts('', current.normalizedText),
      detectedAt,
    };
  }
  if (prior.contentHash === current.contentHash) {
    return null;
  }
  const ops = diffTexts(prior.normalizedText, current.normalizedText);
  if (!hasChanges(ops)) {
    return null;
  }
  return {
    id,
    sourceId: current.sourceId,
    kind: 'amended',
    fromSnapshotId: prior.id,
    toSnapshotId: current.id,
    ops,
    detectedAt,
  };
}
