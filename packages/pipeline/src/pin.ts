import type { Citation, Claim, SnapshotRecord } from '@regdelta/core';

export class PinError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PinError';
  }
}

/**
 * Pin a verbatim quote into a stored snapshot, computing byte offsets
 * DETERMINISTICALLY (Invariant 1/2). The model may propose which text to quote,
 * but the offsets — the provenance that the gate checks byte-exact — are derived
 * here from the snapshot, never trusted from the model. Throws if the quote is
 * not a verbatim substring of the snapshot.
 */
export function pinQuote(snapshot: SnapshotRecord, quote: string): Claim {
  const charStart = snapshot.normalizedText.indexOf(quote);
  if (charStart === -1) {
    throw new PinError(
      `cannot pin quote — not a verbatim substring of snapshot ${snapshot.id}: "${quote.slice(0, 60)}…"`,
    );
  }
  const citation: Citation = {
    snapshotId: snapshot.id,
    sourceUrl: snapshot.url,
    snapshotContentHash: snapshot.contentHash,
    charStart,
    charEnd: charStart + quote.length,
    quotedText: quote,
  };
  return { text: quote, citation };
}
