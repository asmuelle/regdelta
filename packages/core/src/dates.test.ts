import { describe, expect, it } from 'vitest';
import { daysBetween, isValidIsoDate, isoAddSeconds } from './dates';

describe('isValidIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isValidIsoDate('2026-10-01')).toBe(true);
  });

  it('rejects impossible calendar dates that match the pattern', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
  });

  it('rejects non-ISO formats', () => {
    expect(isValidIsoDate('October 1, 2026')).toBe(false);
    expect(isValidIsoDate('2026-1-1')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('computes whole days between ISO dates', () => {
    expect(daysBetween('2026-06-10', '2026-10-01')).toBe(113);
    expect(daysBetween('2026-06-10', '2026-06-09')).toBe(-1);
  });

  it('throws on invalid input instead of returning NaN', () => {
    expect(() => daysBetween('garbage', '2026-06-10')).toThrow(TypeError);
  });
});

describe('isoAddSeconds', () => {
  it('adds seconds deterministically', () => {
    expect(isoAddSeconds('2026-06-10T06:00:00.000Z', 5)).toBe('2026-06-10T06:00:05.000Z');
  });
});
