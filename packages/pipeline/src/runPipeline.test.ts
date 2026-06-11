import { describe, expect, it } from 'vitest';
import {
  evaluateGate,
  resolveCitation,
  verifyEventChain,
  type ChangeCardDraft,
  type CompanyProfile,
} from '@regdelta/core';
import { consumerLendingProfile } from './fixtures';
import { createModelPorts } from './mocks';
import type { ModelPorts, TriageModelPort } from './ports';
import { runPipeline } from './runPipeline';

const dismissiveTriage: TriageModelPort = {
  label: 'stub-triage-zero',
  assess: () => Promise.resolve({ confidence: 0, rationale: 'stubbed to zero' }),
};

const stubbedPorts: ModelPorts = {
  ...createModelPorts(),
  triage: dismissiveTriage,
  provider: 'stub',
};

const offTopicProfile: CompanyProfile = {
  ...consumerLendingProfile,
  id: 'co-offtopic',
  watchTerms: ['derivatives clearing', 'swap execution facility'],
};

describe('runPipeline (M1 slice, deterministic mocks — no AI API)', () => {
  it('flows the CFPB document end-to-end into a published change card', async () => {
    // Act
    const result = await runPipeline();

    // Assert
    expect(result.published).toHaveLength(1);
    expect(result.reviewQueue).toHaveLength(0);
    const { card, gate } = result.published[0]!;
    expect(gate.status).toBe('pass');
    expect(card.reviewState).toBe('auto');
    expect(card.publishedAt).not.toBeNull();
    expect(card.claims.length).toBeGreaterThan(0);
    expect(card.effectiveDate).toBe('2026-10-01');
  });

  it('pins every citation byte-exact against the stored snapshots (Invariant 1)', async () => {
    // Act
    const result = await runPipeline();
    const { card } = result.published[0]!;

    // Assert
    for (const claim of card.claims) {
      const snapshot = result.snapshots.get(claim.citation.snapshotId);
      expect(resolveCitation(claim.citation, snapshot)).toEqual({ resolved: true });
      expect(
        snapshot?.normalizedText.slice(claim.citation.charStart, claim.citation.charEnd),
      ).toBe(claim.citation.quotedText);
      expect(claim.citation.snapshotContentHash).toBe(snapshot?.contentHash);
    }
  });

  it('blocks an artificially corrupted card at the gate (M1 acceptance, Invariant 2)', async () => {
    // Arrange — flip one character inside a quoted span.
    const result = await runPipeline();
    const { card } = result.published[0]!;
    const claim = card.claims[0]!;
    const corruptedQuote = `${claim.citation.quotedText.slice(0, -2)}x.`;
    const corrupted: ChangeCardDraft = {
      ...card,
      claims: [
        { ...claim, citation: { ...claim.citation, quotedText: corruptedQuote } },
        ...card.claims.slice(1),
      ],
    };

    // Act
    const gate = evaluateGate({
      card: corrupted,
      snapshots: result.snapshots,
      verdicts: corrupted.claims.map((_, claimIndex) => ({
        claimIndex,
        entailed: true,
        rationale: 'forced pass to isolate the deterministic validator',
      })),
    });

    // Assert — deterministic validator catches it; route is review queue, never publish.
    expect(gate.status).toBe('fail');
    expect(gate.route).toBe('review_queue');
    expect(gate.checks.find((c) => c.code === 'citations_resolve')?.passed).toBe(false);
  });

  it('produces identical deltas with model calls stubbed out (Invariant 3)', async () => {
    // Act
    const withMocks = await runPipeline();
    const withStubs = await runPipeline({ ports: stubbedPorts });

    // Assert — change DETECTION is model-independent.
    expect(withStubs.deltas).toEqual(withMocks.deltas);
    expect(withStubs.published).toHaveLength(0);
  });

  it('is deterministic across runs: same fixtures, same deltas, same events', async () => {
    // Act
    const first = await runPipeline();
    const second = await runPipeline();

    // Assert
    expect(second.deltas).toEqual(first.deltas);
    expect(second.events).toEqual(first.events);
    expect(second.published[0]?.card).toEqual(first.published[0]?.card);
  });

  it('routes an off-topic profile to irrelevant — logged, audited, no card (triage routing)', async () => {
    // Act
    const result = await runPipeline({ profile: offTopicProfile });

    // Assert
    expect(result.published).toHaveLength(0);
    expect(result.reviewQueue).toHaveLength(0);
    expect(result.triages.every((t) => t.decision === 'irrelevant')).toBe(true);
    // Dismissals are still auditable events (Invariant 6).
    const triageEvents = result.events.filter((e) => e.eventType === 'delta_triaged');
    expect(triageEvents).toHaveLength(result.deltas.length);
    expect(triageEvents.every((e) => e.actorType === 'model')).toBe(true);
  });

  it('records every pipeline step in a verifiable hash-chained event log (Invariant 4)', async () => {
    // Act
    const result = await runPipeline();
    const types = result.events.map((event) => event.eventType);

    // Assert
    expect(verifyEventChain(result.events)).toEqual({ valid: true, brokenAtSeq: null });
    for (const step of [
      'snapshot_recorded',
      'delta_detected',
      'delta_triaged',
      'card_drafted',
      'gate_evaluated',
      'card_published',
    ]) {
      expect(types).toContain(step);
    }
  });

  it('renders the redline from the eCFR amendment as delete/insert ops', async () => {
    // Act
    const result = await runPipeline();
    const { card } = result.published[0]!;
    const inserts = card.redline.filter((op) => op.kind === 'insert').map((op) => op.text);
    const deletes = card.redline.filter((op) => op.kind === 'delete').map((op) => op.text);

    // Assert
    expect(inserts.join(' ')).toContain('not later than three business days');
    expect(deletes.join(' ')).toContain('at the time an application is provided');
  });

  it('ships decision-support copy, never a legal conclusion (Invariant 6)', async () => {
    // Act
    const result = await runPipeline();
    const { card, gate } = result.published[0]!;

    // Assert
    expect(gate.checks.find((c) => c.code === 'decision_support_language')?.passed).toBe(true);
    expect(card.requiredAction.toLowerCase()).toContain('confirm applicability');
  });
});
