const MS_PER_HOUR = 3_600_000;

export interface FreshnessInput {
  readonly lastSuccessAt: string;
  readonly now: string;
  readonly freshnessSlaHours: number;
}

/**
 * Invariant 5: silence never means "no changes". A source whose last successful
 * crawl is older than its SLA window is degraded and must surface visibly.
 */
export function evaluateFreshness({
  lastSuccessAt,
  now,
  freshnessSlaHours,
}: FreshnessInput): 'fresh' | 'degraded' {
  const last = Date.parse(lastSuccessAt);
  const current = Date.parse(now);
  if (Number.isNaN(last) || Number.isNaN(current)) {
    throw new TypeError(`evaluateFreshness: invalid timestamp "${lastSuccessAt}" / "${now}"`);
  }
  const ageHours = (current - last) / MS_PER_HOUR;
  return ageHours > freshnessSlaHours ? 'degraded' : 'fresh';
}
