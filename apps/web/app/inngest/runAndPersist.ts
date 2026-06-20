import {
  persistPipelineRun,
  type DbClient,
  type DeltaTriage,
  type PersistInput,
} from '@regdelta/db';
import { runPipeline } from '@regdelta/pipeline';

export interface RunSummary {
  readonly eventCount: number;
  readonly cardCount: number;
  readonly coverageComplete: boolean;
}

/**
 * Scheduled work unit: run the deterministic pipeline and persist the whole run
 * (event log + projections) in one transaction. Pure orchestration over
 * @regdelta/pipeline + @regdelta/db, so the Inngest cron wrapper stays thin.
 */
export async function runAndPersist(client: DbClient): Promise<RunSummary> {
  const run = await runPipeline();
  const triageByDelta = new Map<string, DeltaTriage>(
    run.triages.map((triage) => [
      triage.deltaId,
      { state: triage.decision, confidence: triage.confidence },
    ]),
  );
  const cards = [...run.published.map((g) => g.card), ...run.reviewQueue.map((g) => g.card)];
  const input: PersistInput = {
    company: run.profile,
    sources: run.sources,
    snapshots: [...run.snapshots.values()],
    deltas: run.deltas,
    cards,
    events: run.events,
    triageByDelta,
  };
  await persistPipelineRun(client, input);
  return {
    eventCount: run.events.length,
    cardCount: cards.length,
    coverageComplete: run.coverage.complete,
  };
}
