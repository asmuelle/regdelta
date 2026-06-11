const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** Strict ISO calendar-date check: pattern AND a real calendar date (rejects 2026-02-30). */
export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.toISOString().slice(0, 10) === value;
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new TypeError(`daysBetween: invalid date input "${fromIso}" / "${toIso}"`);
  }
  return Math.round((to - from) / MS_PER_DAY);
}

/** Add whole seconds to an ISO timestamp; used by the deterministic replay clock. */
export function isoAddSeconds(iso: string, seconds: number): string {
  const base = Date.parse(iso);
  if (Number.isNaN(base)) {
    throw new TypeError(`isoAddSeconds: invalid timestamp "${iso}"`);
  }
  return new Date(base + seconds * 1000).toISOString();
}
