import { describe, expect, it } from 'vitest';
import { classifyRequiredAction } from './action';

describe('classifyRequiredAction (Invariant 6 action policy)', () => {
  it('treats a hedged, non-directive action as advisory', () => {
    const result = classifyRequiredAction(
      'The rule text revises disclosure timing; review the pinned citations and confirm applicability — decision support, not legal judgment.',
    );
    expect(result.isAdvisory).toBe(true);
    expect(result.directiveTerms).toEqual([]);
    expect(result.hasHedge).toBe(true);
  });

  it('flags a customer-directed imperative as non-advisory', () => {
    const result = classifyRequiredAction('File the amended disclosure form by 2026-10-01.');
    expect(result.isAdvisory).toBe(false);
    expect(result.directiveTerms.length).toBeGreaterThan(0);
  });

  it('flags an unhedged action even without an imperative verb', () => {
    const result = classifyRequiredAction('The disclosure timing standard changed.');
    expect(result.hasHedge).toBe(false);
    expect(result.isAdvisory).toBe(false);
  });

  it('does not mistake descriptive "the rule requires" for a directive', () => {
    const result = classifyRequiredAction(
      'The rule requires creditors to deliver disclosures within three business days; confirm applicability for your products.',
    );
    expect(result.directiveTerms).toEqual([]);
    expect(result.isAdvisory).toBe(true);
  });
});
