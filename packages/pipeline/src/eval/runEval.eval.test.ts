/**
 * Offline eval baseline — runs the corpus against the DETERMINISTIC mocks inside
 * `just ci`. It proves the eval harness + corpus are wired and locks the safety
 * property (no unsupported claim is accepted). The live run (`just eval:live`)
 * uses the same runners against real Anthropic ports for the actual numbers.
 */
import { describe, expect, it } from 'vitest';
import { createModelPorts } from '../mocks';
import { CONSUMER_LENDING_TOPICS } from '../topics';
import { runEntailmentEval, runTopicClassifierEval } from './runEval';

export const TOPIC_RECALL_BAR = 1.0;

describe('eval baseline against deterministic mocks (DESIGN.md M2 wiring)', () => {
  const ports = createModelPorts();

  it('catches every expected topic (recall bar) on the topic corpus', async () => {
    const result = await runTopicClassifierEval(ports, CONSUMER_LENDING_TOPICS);
    expect(result.misses).toEqual([]);
    expect(result.recall).toBeGreaterThanOrEqual(TOPIC_RECALL_BAR);
  });

  it('never accepts an unsupported or fabricated claim as entailed (safety bar)', async () => {
    const report = await runEntailmentEval(ports);
    expect(report.leakedClaimIds).toEqual([]);
    expect(report.unsupportedAllRejected).toBe(true);
  });

  it('catches the supported claims it should (entailment recall)', async () => {
    const report = await runEntailmentEval(ports);
    expect(report.result.recall).toBeGreaterThanOrEqual(TOPIC_RECALL_BAR);
  });
});
