import type { Citation, SnapshotRecord } from './types';

export type CitationResolution = { resolved: true } | { resolved: false; reason: string };

/**
 * Verify a citation byte-exactly against its stored snapshot (Invariant 1/2).
 * JS string equality over the same UTF-8 normalized text is byte equality here;
 * any altered character, stale hash, or out-of-range offset fails resolution.
 */
export function resolveCitation(
  citation: Citation,
  snapshot: SnapshotRecord | undefined,
): CitationResolution {
  if (snapshot === undefined) {
    return { resolved: false, reason: `snapshot ${citation.snapshotId} not found` };
  }
  if (snapshot.id !== citation.snapshotId) {
    return { resolved: false, reason: 'citation snapshotId does not match snapshot' };
  }
  if (snapshot.contentHash !== citation.snapshotContentHash) {
    return { resolved: false, reason: 'snapshot content hash mismatch' };
  }
  const { charStart, charEnd } = citation;
  if (charStart < 0 || charEnd <= charStart || charEnd > snapshot.normalizedText.length) {
    return { resolved: false, reason: `offsets [${charStart}, ${charEnd}) out of range` };
  }
  const actual = snapshot.normalizedText.slice(charStart, charEnd);
  if (actual !== citation.quotedText) {
    return { resolved: false, reason: 'quoted span is not byte-identical to the snapshot' };
  }
  return { resolved: true };
}
