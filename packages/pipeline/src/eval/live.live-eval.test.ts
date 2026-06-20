/**
 * LIVE eval against the real Anthropic API. Skipped unless RUN_LIVE_EVAL=1 AND
 * ANTHROPIC_API_KEY is set, so `just ci` never makes a network call. Run it with:
 *
 *   just eval:live          # RUN_LIVE_EVAL=1 vitest run live-eval
 *
 * Prints topic recall/precision and entailment metrics, and asserts the bars:
 * every expected topic caught, and NO unsupported/fabricated claim accepted.
 */
import { describe, expect, it } from 'vitest';
import { createAnthropicInvoker } from '../anthropic/invoker';
import { createLiveModelPorts, resolveModels } from '../anthropic/livePorts';
import { CONSUMER_LENDING_TOPICS } from '../topics';
import { runEntailmentEval, runTopicClassifierEval } from './runEval';
import { TOPIC_RECALL_BAR } from './runEval.eval.test';

const live = process.env['RUN_LIVE_EVAL'] === '1' && Boolean(process.env['ANTHROPIC_API_KEY']);

// Constructed lazily inside the tests — the describe body runs even when skipped,
// so eager invoker creation (which validates the key) must not happen here.
function livePorts(): ReturnType<typeof createLiveModelPorts> {
  const invoker = createAnthropicInvoker(process.env);
  return createLiveModelPorts({ invoker, models: resolveModels(process.env) });
}

describe.skipIf(!live)('live Anthropic eval (real model calls)', () => {
  it('topic classifier catches every expected topic (recall bar)', async () => {
    const result = await runTopicClassifierEval(livePorts(), CONSUMER_LENDING_TOPICS);
    // eslint-disable-next-line no-console
    console.log('[live] topic eval', JSON.stringify(result, null, 2));
    expect(result.misses).toEqual([]);
    expect(result.recall).toBeGreaterThanOrEqual(TOPIC_RECALL_BAR);
  }, 120_000);

  it('entailment rejects every unsupported/fabricated claim (safety bar)', async () => {
    const report = await runEntailmentEval(livePorts());
    // eslint-disable-next-line no-console
    console.log('[live] entailment eval', JSON.stringify(report, null, 2));
    expect(report.leakedClaimIds).toEqual([]);
    expect(report.unsupportedAllRejected).toBe(true);
  }, 120_000);
});
