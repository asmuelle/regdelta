/**
 * Projection persistence (DESIGN.md "tables are projections of the event log").
 *
 * Writes a pipeline run's read-model — company, sources, snapshots, deltas, change
 * cards — alongside the event log, in one transaction. Inputs are core domain types
 * (no dependency on @regdelta/pipeline), so the pipeline/app maps its result onto
 * `PersistInput` and calls this. The event log remains the source of truth; these
 * rows are the fast read side the UI and exports query.
 */
import { asc, eq } from 'drizzle-orm';
import type {
  Claim,
  CompanyProfile,
  DeltaRecord,
  DiffOp,
  EventRecord,
  PublishedChangeCard,
  SnapshotRecord,
  SourceDefinition,
} from '@regdelta/core';
import type { DbClient } from './client';
import { changeCards, companies, deltas, events, snapshots, sources } from './schema';

export type TriageState = 'pending' | 'relevant' | 'irrelevant' | 'error';

export interface DeltaTriage {
  readonly state: TriageState;
  readonly confidence: number | null;
}

export interface PersistInput {
  readonly company: CompanyProfile;
  readonly sources: readonly SourceDefinition[];
  readonly snapshots: readonly SnapshotRecord[];
  readonly deltas: readonly DeltaRecord[];
  readonly cards: readonly PublishedChangeCard[];
  readonly events: readonly EventRecord[];
  /** Per-delta triage outcome for the deltas table; defaults to pending. */
  readonly triageByDelta?: ReadonlyMap<string, DeltaTriage>;
}

/**
 * Persist a full run. FK-safe insert order (sources → company → snapshots →
 * deltas → cards → events) inside a transaction so a run lands all-or-nothing.
 * Stable rows (sources, company) upsert by id; run-specific rows insert fresh.
 */
export async function persistPipelineRun(client: DbClient, input: PersistInput): Promise<void> {
  await client.db.transaction(async (tx) => {
    for (const source of input.sources) {
      await tx
        .insert(sources)
        .values({
          id: source.id,
          adapterId: source.adapterId,
          jurisdiction: source.jurisdiction,
          agency: source.agency,
          feedType: source.feedType,
          url: source.url,
          crawlSchedule: source.crawlSchedule,
          freshnessSlaHours: source.freshnessSlaHours,
          tosBasis: source.tosBasis,
        })
        .onConflictDoNothing();
    }

    await tx
      .insert(companies)
      .values({
        id: input.company.id,
        name: input.company.name,
        vertical: input.company.vertical,
        products: [...input.company.products],
        jurisdictions: [...input.company.jurisdictions],
        licenseTypes: [...input.company.licenseTypes],
        watchTerms: [...input.company.watchTerms],
      })
      .onConflictDoNothing();

    for (const snapshot of input.snapshots) {
      await tx.insert(snapshots).values({
        id: snapshot.id,
        sourceId: snapshot.sourceId,
        url: snapshot.url,
        fetchedAt: snapshot.fetchedAt,
        contentHash: snapshot.contentHash,
        normalizedText: snapshot.normalizedText,
      });
    }

    for (const delta of input.deltas) {
      const triage = input.triageByDelta?.get(delta.id);
      await tx.insert(deltas).values({
        id: delta.id,
        sourceId: delta.sourceId,
        kind: delta.kind,
        fromSnapshotId: delta.fromSnapshotId,
        toSnapshotId: delta.toSnapshotId,
        ops: [...delta.ops],
        detectedAt: delta.detectedAt,
        triageState: triage?.state ?? 'pending',
        triageConfidence: triage?.confidence == null ? null : String(triage.confidence),
      });
    }

    for (const card of input.cards) {
      await tx.insert(changeCards).values({
        id: card.id,
        deltaId: card.deltaId,
        companyId: card.companyId,
        title: card.title,
        summary: card.summary,
        requiredAction: card.requiredAction,
        affectedProducts: [...card.affectedProducts],
        effectiveDate: card.effectiveDate,
        deadline: card.deadline,
        materiality: card.materiality,
        redline: [...card.redline],
        claims: [...card.claims],
        reviewState: card.reviewState,
        publishedAt: card.publishedAt,
      });
    }

    if (input.events.length > 0) {
      await tx.insert(events).values(
        input.events.map((event) => ({
          seq: event.seq,
          actorType: event.actorType,
          actorId: event.actorId,
          eventType: event.eventType,
          payload: event.payload,
          occurredAt: event.occurredAt,
          prevEventHash: event.prevEventHash,
          eventHash: event.eventHash,
        })),
      );
    }
  });
}

/** Read persisted change cards for a company, newest-published projection shape. */
export async function loadChangeCards(
  client: DbClient,
  companyId: string,
): Promise<PublishedChangeCard[]> {
  const rows = await client.db
    .select()
    .from(changeCards)
    .where(eq(changeCards.companyId, companyId))
    .orderBy(asc(changeCards.id));
  return rows.map((row) => ({
    id: row.id,
    deltaId: row.deltaId,
    companyId: row.companyId,
    title: row.title,
    summary: row.summary,
    requiredAction: row.requiredAction,
    affectedProducts: row.affectedProducts,
    effectiveDate: row.effectiveDate,
    deadline: row.deadline,
    materiality: row.materiality,
    redline: row.redline as readonly DiffOp[],
    claims: row.claims as readonly Claim[],
    reviewState: row.reviewState,
    publishedAt: row.publishedAt,
  }));
}

/** Read persisted snapshots for a source in fetch order — citation-resolution targets. */
export async function loadSnapshots(client: DbClient, sourceId: string): Promise<SnapshotRecord[]> {
  const rows = await client.db
    .select()
    .from(snapshots)
    .where(eq(snapshots.sourceId, sourceId))
    .orderBy(asc(snapshots.fetchedAt));
  return rows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    url: row.url,
    fetchedAt: row.fetchedAt,
    contentHash: row.contentHash,
    normalizedText: row.normalizedText,
  }));
}
