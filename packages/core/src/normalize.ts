/**
 * Deterministic, idempotent text normalization applied before snapshotting.
 * Paragraph breaks (blank lines) are preserved as `\n\n`; all other whitespace
 * inside a paragraph collapses to single spaces, so sentence segments remain
 * exact substrings of the normalized text (citation pinning depends on this).
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}
