/**
 * Triage routing policy (DESIGN.md cost discipline; Invariant 3).
 *
 * The cheap classification stage must SEE every in-jurisdiction delta. Embeddings
 * may only *order* the review/classification queue — they may never *exclude* a
 * delta, because an embedding similarity cut is a learned filter capable of the
 * fatal false-negative class. This module makes "rank, never filter" enforceable:
 * `selectClassificationQueue` decides membership deterministically, and
 * `applyEmbeddingRanking` reorders while asserting the set is preserved.
 */
import { InvariantViolationError } from './errors';
import { FEDERAL_JURISDICTION } from './taxonomy';
import type { CompanyProfile } from './types';

/** A delta paired with the jurisdiction of its source (looked up deterministically). */
export interface DeltaScope {
  readonly deltaId: string;
  readonly jurisdiction: string;
}

function inScopeForAnyProfile(jurisdiction: string, profiles: readonly CompanyProfile[]): boolean {
  if (jurisdiction === FEDERAL_JURISDICTION) {
    return profiles.length > 0;
  }
  return profiles.some((profile) => profile.jurisdictions.includes(jurisdiction));
}

/**
 * Every delta whose source jurisdiction is in scope for at least one profile must
 * be classified. Federal sources are in scope for all profiles. Deterministic;
 * order follows input order (stable) until an explicit ranking is applied.
 */
export function selectClassificationQueue(
  scopes: readonly DeltaScope[],
  profiles: readonly CompanyProfile[],
): readonly string[] {
  return scopes
    .filter((scope) => inScopeForAnyProfile(scope.jurisdiction, profiles))
    .map((scope) => scope.deltaId);
}

/**
 * Reorder a classification queue by embedding score (highest first), breaking ties
 * by delta id for determinism. EVERY input id is retained — a missing score sorts
 * last but is never dropped. Throws if the output set diverges from the input set,
 * so a future embedding integration cannot quietly turn ranking into filtering.
 */
export function applyEmbeddingRanking(
  queue: readonly string[],
  scores: ReadonlyMap<string, number>,
): readonly string[] {
  const ranked = [...queue].sort((a, b) => {
    const sa = scores.get(a) ?? 0;
    const sb = scores.get(b) ?? 0;
    return sb - sa || (a < b ? -1 : a > b ? 1 : 0);
  });
  assertNoDrop(queue, ranked);
  return ranked;
}

/** Guard: a ranking must be a permutation of its input — never a subset. */
export function assertNoDrop(before: readonly string[], after: readonly string[]): void {
  if (before.length !== after.length || new Set(after).size !== new Set(before).size) {
    throw new InvariantViolationError(
      'INV3_EMBEDDING_RANK_ONLY',
      `embedding step dropped deltas: ${before.length} in, ${after.length} out — ` +
        'embeddings may rank the triage queue but never filter it (DESIGN.md cost discipline)',
    );
  }
  for (const id of before) {
    if (!after.includes(id)) {
      throw new InvariantViolationError(
        'INV3_EMBEDDING_RANK_ONLY',
        `embedding step dropped delta "${id}" — embeddings may rank but never filter`,
      );
    }
  }
}
