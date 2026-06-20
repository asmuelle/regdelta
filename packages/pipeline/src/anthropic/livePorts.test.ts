import { describe, expect, it } from 'vitest';
import { sha256Hex, type Claim, type SnapshotRecord } from '@regdelta/core';
import type { ModelInvoker, ToolCall } from './invoker';
import { createLiveModelPorts } from './livePorts';
import { CONSUMER_LENDING_TOPICS } from '../topics';

/** A fake invoker that returns canned tool inputs keyed by tool name. */
function fakeInvoker(byTool: Record<string, unknown>): ModelInvoker {
  return {
    invokeTool: (call: ToolCall) => {
      if (!(call.toolName in byTool)) {
        throw new Error(`no canned response for tool ${call.toolName}`);
      }
      return Promise.resolve(byTool[call.toolName]);
    },
  };
}

const TEXT = 'The rule requires creditors to deliver disclosures within three business days.';
const snapshot: SnapshotRecord = {
  id: 'snap-1',
  sourceId: 'src-1',
  url: 'https://www.federalregister.gov/test',
  fetchedAt: '2026-06-10T06:00:00.000Z',
  contentHash: sha256Hex(TEXT),
  normalizedText: TEXT,
};
const models = { cheap: 'test-cheap', frontier: 'test-frontier' };

describe('live topic classifier (offline, fake invoker)', () => {
  it('parses assignments and drops hallucinated topic ids not in the taxonomy', async () => {
    const ports = createLiveModelPorts({
      models,
      invoker: fakeInvoker({
        report_topics: {
          assignments: [
            { topicId: 'topic-reg-z-disclosure', confidence: 0.9, matchedKeywords: ['disclosure'] },
            { topicId: 'topic-hallucinated', confidence: 0.8 },
          ],
        },
      }),
    });

    const result = await ports.topicClassifier.classify({
      deltaText: TEXT,
      topics: CONSUMER_LENDING_TOPICS,
    });

    expect(result.assignments.map((a) => a.topicId)).toEqual(['topic-reg-z-disclosure']);
  });
});

describe('live synthesis (offline, fake invoker)', () => {
  it('pins verbatim quotes to byte offsets and drops fabricated ones', async () => {
    const ports = createLiveModelPorts({
      models,
      invoker: fakeInvoker({
        draft_change_card: {
          title: 'Reg Z disclosure timing',
          summary: 'Timing standard revised.',
          requiredAction:
            'Review the pinned citations and confirm applicability — decision support.',
          affectedProducts: ['HELOC'],
          effectiveDate: '2026-10-01',
          deadline: null,
          claims: [
            { snapshotId: 'snap-1', quote: 'The rule requires creditors to deliver disclosures' },
            { snapshotId: 'snap-1', quote: 'a fabricated sentence never present in the source' },
          ],
        },
      }),
    });

    const draft = await ports.synthesis.draft({
      profile: {
        id: 'co-1',
        name: 'X',
        vertical: 'consumer_lending',
        products: ['HELOC'],
        jurisdictions: ['US-FED'],
        licenseTypes: [],
        watchTerms: [],
      },
      notice: { snapshot, title: 't', documentNumber: 'd', effectiveOn: '2026-10-01' },
      amendment: null,
    });

    // Only the verbatim quote survives; its offsets resolve byte-exact.
    expect(draft.claims).toHaveLength(1);
    const claim = draft.claims[0] as Claim;
    expect(snapshot.normalizedText.slice(claim.citation.charStart, claim.citation.charEnd)).toBe(
      claim.citation.quotedText,
    );
  });
});

describe('live entailment (offline, fake invoker)', () => {
  it('fails closed: a claim with no returned verdict is treated as not entailed', async () => {
    const ports = createLiveModelPorts({
      models,
      invoker: fakeInvoker({
        // Two claims sent, but the model only verdicts claim 0.
        report_verdicts: { verdicts: [{ claimIndex: 0, entailed: true, rationale: 'ok' }] },
      }),
    });
    const claims: Claim[] = [
      {
        text: TEXT,
        citation: {
          snapshotId: 'snap-1',
          sourceUrl: snapshot.url,
          snapshotContentHash: snapshot.contentHash,
          charStart: 0,
          charEnd: TEXT.length,
          quotedText: TEXT,
        },
      },
      {
        text: 'second',
        citation: {
          snapshotId: 'snap-1',
          sourceUrl: snapshot.url,
          snapshotContentHash: snapshot.contentHash,
          charStart: 0,
          charEnd: 6,
          quotedText: 'The ru',
        },
      },
    ];

    const verdicts = await ports.entailment.verify({
      claims,
      snapshots: new Map([[snapshot.id, snapshot]]),
    });

    expect(verdicts).toHaveLength(2);
    expect(verdicts[0]?.entailed).toBe(true);
    expect(verdicts[1]?.entailed).toBe(false);
  });
});
