/**
 * Live-DB integration tests (Invariant 4 — proven AT the database). Skipped unless
 * DATABASE_URL is set, so the offline unit suite never needs Postgres; CI sets it
 * and runs the Postgres service, so this is the real append-only proof there.
 *
 * Run locally: `just db-up && DATABASE_URL=postgres://regdelta:regdelta@localhost:5432/regdelta pnpm test`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appendEvent, buildAuditExport, verifyEventChain, type EventRecord } from '@regdelta/core';
import { applyMigrations, createDbClient, type DbClient } from './client';
import { EventRepository } from './repository';

const databaseUrl = process.env['DATABASE_URL'];
const live = typeof databaseUrl === 'string' && databaseUrl.length > 0;

function sampleLog(): readonly EventRecord[] {
  let log: readonly EventRecord[] = [];
  log = appendEvent(
    log,
    { actorType: 'system', actorId: 'p', eventType: 'snapshot_recorded', payload: { id: 's1' } },
    '2026-06-10T06:00:00.000Z',
  );
  log = appendEvent(
    log,
    { actorType: 'model', actorId: 'm', eventType: 'delta_triaged', payload: { ok: true } },
    '2026-06-10T06:00:01.000Z',
  );
  log = appendEvent(
    log,
    {
      actorType: 'human',
      actorId: 'r@x.com',
      eventType: 'human_decision',
      payload: { kind: 'approve_card', subjectId: 'c1', reason: 'verified' },
    },
    '2026-06-10T06:00:02.000Z',
  );
  return log;
}

describe.skipIf(!live)('event log persistence + append-only enforcement (Invariant 4)', () => {
  let client: DbClient;
  let repo: EventRepository;

  beforeAll(async () => {
    client = createDbClient(databaseUrl as string, { max: 1 });
    await applyMigrations(client);
    // TRUNCATE is not UPDATE/DELETE, so the append-only trigger permits this reset.
    await client.sql`TRUNCATE TABLE events`;
    repo = new EventRepository(client);
  }, 60_000);

  afterAll(async () => {
    if (client !== undefined) {
      await client.close();
    }
  });

  it('persists and reads back a hash-chained log that verifies end-to-end', async () => {
    const log = sampleLog();
    await repo.append(log);

    const loaded = await repo.all();

    expect(loaded).toEqual(log);
    expect(verifyEventChain(loaded)).toEqual({ valid: true, brokenAtSeq: null });
  });

  it('rejects UPDATE on the events table at the database', async () => {
    await expect(client.sql`UPDATE events SET actor_id = 'tampered' WHERE seq = 1`).rejects.toThrow(
      /append-only/i,
    );
  });

  it('rejects DELETE on the events table at the database', async () => {
    await expect(client.sql`DELETE FROM events WHERE seq = 1`).rejects.toThrow(/append-only/i);
  });

  it('exports a reproducible checksum from the persisted log', async () => {
    const loaded = await repo.all();
    const first = buildAuditExport({
      events: loaded,
      format: 'csv',
      generatedAt: '2026-06-20T00:00:00.000Z',
    });
    const second = buildAuditExport({
      events: loaded,
      format: 'json',
      generatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(second.checksum).toBe(first.checksum);
  });
});
