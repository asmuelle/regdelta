import type { EventRecord } from '@regdelta/core';
import { createDbClient, EventRepository, persistPipelineRun } from '@regdelta/db';
import type { PipelineRunResult } from '@regdelta/pipeline';
import { toPersistInput } from './inngest/runAndPersist';

export interface LiveLog {
  readonly events: readonly EventRecord[];
  /** True when backed by a reachable database — enables approve/reject controls. */
  readonly interactive: boolean;
}

/**
 * The event log the page renders. With DATABASE_URL set and reachable, read the
 * persisted log (seeding it from this run on first load), so human decisions made
 * via the server action are reflected. Otherwise — and if the DB is unreachable —
 * degrade to the in-process pipeline run, read-only, rather than erroring.
 */
export async function loadLiveLog(result: PipelineRunResult): Promise<LiveLog> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return { events: result.events, interactive: false };
  }

  const client = createDbClient(databaseUrl, { max: 1 });
  try {
    const repo = new EventRepository(client);
    let events = await repo.all();
    if (events.length === 0) {
      try {
        await persistPipelineRun(client, toPersistInput(result));
      } catch {
        // A concurrent first-load seed may win the race; re-read below.
      }
      events = await repo.all();
    }
    return { events, interactive: true };
  } catch {
    return { events: result.events, interactive: false };
  } finally {
    await client.close();
  }
}
