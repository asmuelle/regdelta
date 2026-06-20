/**
 * Live-DB integration tests (Invariant 4 — proven AT the database). Skipped unless
 * DATABASE_URL is set, so the offline unit suite never needs Postgres; CI sets it
 * and runs the Postgres service, so this is the real append-only proof there.
 *
 * Run locally: `just db-up && DATABASE_URL=postgres://regdelta:regdelta@localhost:5432/regdelta pnpm test`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appendEvent,
  buildAuditExport,
  projectReviewState,
  verifyEventChain,
  type EventRecord,
} from '@regdelta/core';
import { runPipeline } from '@regdelta/pipeline';
import { applyMigrations, createDbClient, type DbClient } from './client';
import { recordReviewDecision } from './decisions';
import { EventRepository } from './repository';
import {
  loadChangeCards,
  loadSnapshots,
  persistPipelineRun,
  type DeltaTriage,
  type PersistInput,
} from './projections';

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

// Runs after the append-only suite (same file → sequential), so the two suites
// never race on the global events.seq primary key against the shared database.
describe.skipIf(!live)('end-to-end pipeline persistence (projections + event log)', () => {
  let client: DbClient;

  beforeAll(async () => {
    client = createDbClient(databaseUrl as string, { max: 1 });
    await applyMigrations(client);
    await client.sql`TRUNCATE TABLE events, change_cards, deltas, snapshots, companies, sources CASCADE`;

    const run = await runPipeline();
    const triageByDelta = new Map<string, DeltaTriage>(
      run.triages.map((triage) => [
        triage.deltaId,
        { state: triage.decision, confidence: triage.confidence },
      ]),
    );
    const input: PersistInput = {
      company: run.profile,
      sources: run.sources,
      snapshots: [...run.snapshots.values()],
      deltas: run.deltas,
      cards: [...run.published.map((g) => g.card), ...run.reviewQueue.map((g) => g.card)],
      events: run.events,
      triageByDelta,
    };
    await persistPipelineRun(client, input);
  }, 60_000);

  afterAll(async () => {
    if (client !== undefined) {
      await client.close();
    }
  });

  it('persists the published change card with its citations intact', async () => {
    const cards = await loadChangeCards(client, 'co-meridian-home-lending');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    const card = cards[0]!;
    expect(card.claims.length).toBeGreaterThan(0);
    expect(typeof card.claims[0]!.citation.charStart).toBe('number');
    expect(card.effectiveDate).toBe('2026-10-01');
  });

  it('persists snapshots that still satisfy citation resolution byte-exact', async () => {
    const snaps = await loadSnapshots(client, 'src-federal-register-cfpb');
    expect(snaps.length).toBeGreaterThanOrEqual(1);
    const byId = new Map(snaps.map((s) => [s.id, s]));
    const cards = await loadChangeCards(client, 'co-meridian-home-lending');
    for (const claim of cards[0]!.claims) {
      const snap = byId.get(claim.citation.snapshotId);
      if (snap === undefined) {
        continue; // claim may cite the eCFR snapshot under its own source
      }
      expect(snap.normalizedText.slice(claim.citation.charStart, claim.citation.charEnd)).toBe(
        claim.citation.quotedText,
      );
    }
  });

  it('persists an event log that verifies end-to-end and exports reproducibly', async () => {
    const loaded = await new EventRepository(client).all();
    expect(loaded.length).toBeGreaterThan(0);
    expect(verifyEventChain(loaded)).toEqual({ valid: true, brokenAtSeq: null });
    const a = buildAuditExport({
      events: loaded,
      format: 'csv',
      generatedAt: '2026-06-20T00:00:00.000Z',
    });
    const b = buildAuditExport({
      events: loaded,
      format: 'json',
      generatedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(b.checksum).toBe(a.checksum);
  });

  // Declared last: it appends seq=16 to the shared log, so earlier tests (which
  // assert chain validity, not exact counts) are unaffected.
  it('records a human approval that chains onto the log and resolves the card', async () => {
    const cards = await loadChangeCards(client, 'co-meridian-home-lending');
    const card = cards[0]!;

    const event = await recordReviewDecision(client, {
      actorId: 'reviewer@meridian.example',
      kind: 'approve_card',
      subjectId: card.id,
      reason: 'verified against the pinned source',
      occurredAt: '2026-06-20T09:30:00.000Z',
    });

    expect(event.actorType).toBe('human');
    const loaded = await new EventRepository(client).all();
    // The decision chained onto the tail and the whole chain still verifies.
    expect(verifyEventChain(loaded)).toEqual({ valid: true, brokenAtSeq: null });
    // Projecting the card over the persisted log reflects the human approval.
    expect(projectReviewState(card, loaded).reviewState).toBe('approved');
  });
});
