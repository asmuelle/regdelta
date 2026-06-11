const MIN_TOKEN_LENGTH = 3;

/** Lowercased alphanumeric tokens of length >= 3; deterministic. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/** Fraction of `claimTokens` covered by `quoteTokens` (0 when no tokens). */
export function tokenCoverage(claimText: string, quoteText: string): number {
  const claimTokens = tokenize(claimText);
  if (claimTokens.length === 0) {
    return 0;
  }
  const quoteTokens = new Set(tokenize(quoteText));
  const covered = claimTokens.filter((token) => quoteTokens.has(token)).length;
  return covered / claimTokens.length;
}

/** Count of distinct tokens in `a` that also occur in `b`. */
export function sharedTokenCount(a: string, b: string): number {
  const bTokens = new Set(tokenize(b));
  return [...new Set(tokenize(a))].filter((token) => bTokens.has(token)).length;
}
