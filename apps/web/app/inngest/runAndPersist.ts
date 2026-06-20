import {
  persistPipelineRun,
  type DbClient,
  type DeltaTriage,
  type PersistInput,
} from '@regdelta/db';
import { runPipeline, type PipelineRunResult } from '@regdelta/pipeline';

export interface RunSummary {
  readonly eventCount: number;
  readonly cardCount: number;
  readonly coverageComplete: boolean;
}

/** Map a pipeline run onto the persistence input (shared by the cron and page seeding). */
export function toPersistInput(run: PipelineRunResult): PersistInput {
  const triageByDelta = new Map<string, DeltaTriage>(
    run.triages.map((triage) => [
      triage.deltaId,
      { state: triage.decision, confidence: triage.confidence },
    ]),
  );
  return {
    company: run.profile,
    sources: run.sources,
    snapshots: [...run.snapshots.values()],
    deltas: run.deltas,
    cards: [...run.published.map((g) => g.card), ...run.reviewQueue.map((g) => g.card)],
    events: run.events,
    triageByDelta,
  };
}

/**
 * Scheduled work unit: run the deterministic pipeline and persist the whole run
 * (event log + projections) in one transaction. Pure orchestration over
 * @regdelta/pipeline + @regdelta/db, so the Inngest cron wrapper stays thin.
 */
export async function runAndPersist(client: DbClient): Promise<RunSummary> {
  const run = await runPipeline();
  const input = toPersistInput(run);
  await persistPipelineRun(client, input);
  return {
    eventCount: run.events.length,
    cardCount: input.cards.length,
    coverageComplete: run.coverage.complete,
  };
}
