import { describe, expect, it } from 'vitest';
import { buildAlertContent, eligibleAlertCards } from './alerts';
import type { PublishedChangeCard } from './types';

function card(overrides: Partial<PublishedChangeCard> = {}): PublishedChangeCard {
  return {
    id: 'card-1',
    deltaId: 'delta-1',
    companyId: 'co-1',
    title: 'Reg Z HELOC disclosure timing',
    summary: 'Timing moved to an application-receipt basis.',
    requiredAction: 'confirm applicability — decision support',
    affectedProducts: ['HELOC'],
    effectiveDate: '2026-10-01',
    deadline: null,
    materiality: 'normal',
    redline: [],
    claims: [],
    reviewState: 'auto',
    publishedAt: '2026-06-10T06:00:10.000Z',
    ...overrides,
  };
}

describe('buildAlertContent', () => {
  it('flags high materiality in the subject and includes provenance/effective date', () => {
    const content = buildAlertContent(card({ materiality: 'high' }));
    expect(content.subject).toContain('HIGH MATERIALITY');
    expect(content.body).toContain('Effective: 2026-10-01');
    expect(content.body).toContain('card-1');
  });

  it('renders none_stated and a deadline line', () => {
    const content = buildAlertContent(
      card({ effectiveDate: 'none_stated', deadline: '2026-08-01' }),
    );
    expect(content.body).toContain('none stated in source');
    expect(content.body).toContain('Deadline: 2026-08-01');
  });
});

describe('eligibleAlertCards', () => {
  it('includes published normal cards and excludes unpublished + unapproved-high', () => {
    const cards = [
      card({ id: 'a' }),
      card({ id: 'b', publishedAt: null }),
      card({ id: 'c', materiality: 'high' }),
    ];
    expect(eligibleAlertCards(cards, []).map((c) => c.id)).toEqual(['a']);
  });
});
