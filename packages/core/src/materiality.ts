import { daysBetween, isValidIsoDate } from './dates';
import { NONE_STATED, type EffectiveDate, type Materiality } from './types';

/** Effective dates inside this window make a change high-materiality. */
export const HIGH_MATERIALITY_WINDOW_DAYS = 30;

const HIGH_SIGNAL_PATTERN =
  /effective immediately|civil money penalty|enforcement action|cease and desist/i;

export interface MaterialityInput {
  readonly effectiveDate: EffectiveDate;
  readonly now: string;
  readonly text: string;
}

/** Deterministic materiality scoring — no model involved. */
export function scoreMateriality({ effectiveDate, now, text }: MaterialityInput): Materiality {
  if (HIGH_SIGNAL_PATTERN.test(text)) {
    return 'high';
  }
  if (effectiveDate !== NONE_STATED && isValidIsoDate(effectiveDate)) {
    const days = daysBetween(now, effectiveDate);
    if (days >= 0 && days <= HIGH_MATERIALITY_WINDOW_DAYS) {
      return 'high';
    }
  }
  return 'normal';
}
