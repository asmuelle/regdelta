/**
 * Drizzle schema for RegDelta (DESIGN.md "Data model sketch").
 *
 * Invariant notes enforced at the schema level where representable:
 * - `sources.tosBasis` is NOT NULL: a source without a recorded permissible-access
 *   basis is unrepresentable (Invariant 8).
 * - `events` is the append-only audit log (Invariant 4). The UPDATE/DELETE-rejection
 *   trigger + REVOKE ship in migration 0001_event_log_append_only; hash-chain columns here.
 * - `snapshots` are immutable once written; corrections are new snapshots.
 */
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  adapterId: text('adapter_id').notNull(),
  jurisdiction: text('jurisdiction').notNull(),
  agency: text('agency').notNull(),
  feedType: text('feed_type', { enum: ['api', 'rss', 'html'] }).notNull(),
  url: text('url').notNull(),
  crawlSchedule: text('crawl_schedule').notNull(),
  freshnessSlaHours: integer('freshness_sla_hours').notNull(),
  status: text('status', { enum: ['active', 'degraded', 'unsupported'] })
    .notNull()
    .default('active'),
  tosBasis: text('tos_basis').notNull(),
});

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  vertical: text('vertical').notNull(),
  products: jsonb('products').$type<string[]>().notNull(),
  jurisdictions: jsonb('jurisdictions').$type<string[]>().notNull(),
  licenseTypes: jsonb('license_types').$type<string[]>().notNull(),
  watchTerms: jsonb('watch_terms').$type<string[]>().notNull(),
  profileEmbedding: vector('profile_embedding', { dimensions: 1536 }),
});

export const snapshots = pgTable(
  'snapshots',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    url: text('url').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'string' }).notNull(),
    contentHash: text('content_hash').notNull(),
    normalizedText: text('normalized_text').notNull(),
  },
  (table) => [index('snapshots_source_idx').on(table.sourceId, table.fetchedAt)],
);

export const deltas = pgTable('deltas', {
  id: text('id').primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  kind: text('kind', { enum: ['new_document', 'amended'] }).notNull(),
  fromSnapshotId: text('from_snapshot_id').references(() => snapshots.id),
  toSnapshotId: text('to_snapshot_id')
    .notNull()
    .references(() => snapshots.id),
  ops: jsonb('ops').notNull(),
  detectedAt: timestamp('detected_at', { withTimezone: true, mode: 'string' }).notNull(),
  triageState: text('triage_state', {
    enum: ['pending', 'relevant', 'irrelevant', 'error'],
  })
    .notNull()
    .default('pending'),
  triageConfidence: text('triage_confidence'),
});

export const changeCards = pgTable('change_cards', {
  id: text('id').primaryKey(),
  deltaId: text('delta_id')
    .notNull()
    .references(() => deltas.id),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  requiredAction: text('required_action').notNull(),
  affectedProducts: jsonb('affected_products').$type<string[]>().notNull(),
  effectiveDate: text('effective_date').notNull(),
  deadline: text('deadline'),
  materiality: text('materiality', { enum: ['high', 'normal'] }).notNull(),
  redline: jsonb('redline').notNull(),
  claims: jsonb('claims').notNull(),
  reviewState: text('review_state', {
    enum: ['auto', 'pending_review', 'approved', 'rejected'],
  }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
});

/** Append-only audit log (Invariant 4). Tables above are projections of this. */
export const events = pgTable(
  'events',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey(),
    actorType: text('actor_type', { enum: ['system', 'model', 'human'] }).notNull(),
    actorId: text('actor_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    // TEXT, not timestamptz: the hash chain is computed over the exact ISO string,
    // so it must persist and reload byte-identical (timestamptz would normalize it
    // and silently break verifyEventChain after a reload). Immutable by Invariant 4.
    occurredAt: text('occurred_at').notNull(),
    prevEventHash: text('prev_event_hash'),
    eventHash: text('event_hash').notNull(),
  },
  (table) => [uniqueIndex('events_hash_unique').on(table.eventHash)],
);
