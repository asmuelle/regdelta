import { describe, expect, it } from 'vitest';
import { evaluateGate } from './gate';
import { sha256Hex } from './hash';
import { validateChangeCardDraft } from './validation';
import type { ChangeCardDraft, EntailmentVerdict, SnapshotRecord } from './types';

const TEXT =
  'The disclosures and brochure shall be delivered not later than three business days after the creditor receives the application. The rule is effective October 1, 2026.';

const snapshot: SnapshotRecord = {
  id: 'snap-gate',
  sourceId: 'src-gate',
  url: 'https://www.federalregister.gov/test',
  fetchedAt: '2026-06-10T06:00:00.000Z',
  contentHash: sha256Hex(TEXT),
  normalizedText: TEXT,
};

const snapshots = new Map<string, SnapshotRecord>([[snapshot.id, snapshot]]);

const QUOTE =
  'The disclosures and brochure shall be delivered not later than three business days after the creditor receives the application.';

function makeCard(overrides: Partial<ChangeCardDraft> = {}): ChangeCardDraft {
  return {
    id: 'card-1',
    deltaId: 'delta-1',
    companyId: 'co-1',
    title: 'Reg Z HELOC disclosure timing amended',
    summary: 'The disclosure timing standard moved to an application-receipt basis.',
    requiredAction:
      'The rule text requires delivery within three business days of application receipt; confirm applicability.',
    affectedProducts: ['Home equity line of credit (HELOC)'],
    effectiveDate: '2026-10-01',
    deadline: null,
    materiality: 'normal',
    redline: [{ kind: 'insert', text: QUOTE }],
    claims: [
      {
        text: QUOTE,
        citation: {
          snapshotId: snapshot.id,
          sourceUrl: snapshot.url,
          snapshotContentHash: snapshot.contentHash,
          charStart: 0,
          charEnd: QUOTE.length,
          quotedText: QUOTE,
        },
      },
    ],
    ...overrides,
  };
}

const allEntailed: EntailmentVerdict[] = [{ claimIndex: 0, entailed: true, rationale: 'quote' }];

describe('evaluateGate', () => {
  it('passes a fully provenanced, byte-exact, entailed card and routes to publish', () => {
    // Act
    const result = evaluateGate({ card: makeCard(), snapshots, verdicts: allEntailed });

    // Assert
    expect(result.status).toBe('pass');
    expect(result.route).toBe('publish');
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('blocks a card when one character in a quoted span is altered (Invariant 2)', () => {
    // Arrange — corrupt one character inside the quote
    const card = makeCard();
    const claim = card.claims[0]!;
    const corrupted = {
      ...card,
      claims: [
        {
          ...claim,
          citation: {
            ...claim.citation,
            quotedText: claim.citation.quotedText.replace('three', 'threa'),
          },
        },
      ],
    };

    // Act
    const result = evaluateGate({ card: corrupted, snapshots, verdicts: allEntailed });

    // Assert
    expect(result.status).toBe('fail');
    expect(result.route).toBe('review_queue');
    expect(result.checks.find((c) => c.code === 'citations_resolve')?.passed).toBe(false);
  });

  it('blocks a card whose effective date does not parse', () => {
    const result = evaluateGate({
      card: makeCard({ effectiveDate: '2026-13-40' }),
      snapshots,
      verdicts: allEntailed,
    });
    expect(result.status).toBe('fail');
    expect(result.checks.find((c) => c.code === 'dates_parse')?.passed).toBe(false);
  });

  it('blocks a card containing a non-entailed claim and routes it to the review queue', () => {
    const result = evaluateGate({
      card: makeCard(),
      snapshots,
      verdicts: [{ claimIndex: 0, entailed: false, rationale: 'claim not supported by quote' }],
    });
    expect(result.status).toBe('fail');
    expect(result.route).toBe('review_queue');
    expect(result.checks.find((c) => c.code === 'entailment')?.passed).toBe(false);
  });

  it('blocks legal-conclusion phrasing in customer-facing copy (Invariant 6)', () => {
    const result = evaluateGate({
      card: makeCard({
        requiredAction: 'You must deliver disclosures within three business days.',
      }),
      snapshots,
      verdicts: allEntailed,
    });
    expect(result.status).toBe('fail');
    expect(result.checks.find((c) => c.code === 'decision_support_language')?.passed).toBe(false);
  });

  it('routes a directive requiredAction to review even with no forbidden phrase (action policy)', () => {
    // Arrange — "File ... by" is a customer-directed imperative the entailment
    // gate cannot verify, but it trips no FORBIDDEN_CONCLUSION_PHRASES.
    const result = evaluateGate({
      card: makeCard({ requiredAction: 'File the amended disclosure form with the regulator.' }),
      snapshots,
      verdicts: allEntailed,
    });

    // Assert — decision-support phrasing passes, but the advisory check blocks it.
    expect(result.checks.find((c) => c.code === 'decision_support_language')?.passed).toBe(true);
    expect(result.checks.find((c) => c.code === 'action_advisory')?.passed).toBe(false);
    expect(result.route).toBe('review_queue');
  });

  it('fails entailment when verdict count does not cover every claim', () => {
    const result = evaluateGate({ card: makeCard(), snapshots, verdicts: [] });
    expect(result.status).toBe('fail');
    expect(result.checks.find((c) => c.code === 'entailment')?.passed).toBe(false);
  });
});

describe('validateChangeCardDraft (Invariant 1 — provenance is unrepresentable-free)', () => {
  it('accepts a complete card', () => {
    expect(validateChangeCardDraft(makeCard())).toEqual({ valid: true });
  });

  it('rejects a card with no citations', () => {
    const result = validateChangeCardDraft(makeCard({ claims: [] }));
    expect(result.valid).toBe(false);
  });

  it('rejects a card with a citation missing its content hash', () => {
    const card = makeCard();
    const claim = card.claims[0]!;
    const result = validateChangeCardDraft({
      ...card,
      claims: [{ ...claim, citation: { ...claim.citation, snapshotContentHash: '' } }],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects a missing effective date but accepts the explicit none_stated marker', () => {
    expect(validateChangeCardDraft(makeCard({ effectiveDate: '' })).valid).toBe(false);
    expect(validateChangeCardDraft(makeCard({ effectiveDate: 'none_stated' })).valid).toBe(true);
  });
});
