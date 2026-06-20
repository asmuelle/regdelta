/**
 * Event-log repository (Invariant 4). Separation of concerns: @regdelta/core
 * BUILDS the hash-chained events and VERIFIES the chain; this repository only
 * persists already-built EventRecords and reads them back in seq order. It never
 * updates or deletes — the database trigger from migration 0001 enforces that
 * even if a caller tried.
 */
import { asc } from 'drizzle-orm';
import type { EventRecord, JsonValue } from '@regdelta/core';
import type { DbClient } from './client';
import { events } from './schema';

type EventRow = typeof events.$inferSelect;

function toRow(record: EventRecord): typeof events.$inferInsert {
  return {
    seq: record.seq,
    actorType: record.actorType,
    actorId: record.actorId,
    eventType: record.eventType,
    payload: record.payload,
    occurredAt: record.occurredAt,
    prevEventHash: record.prevEventHash,
    eventHash: record.eventHash,
  };
}

function fromRow(row: EventRow): EventRecord {
  return {
    seq: row.seq,
    actorType: row.actorType,
    actorId: row.actorId,
    eventType: row.eventType,
    payload: row.payload as JsonValue,
    occurredAt: row.occurredAt,
    prevEventHash: row.prevEventHash,
    eventHash: row.eventHash,
  };
}

export class EventRepository {
  constructor(private readonly client: DbClient) {}

  /** Append already-built, hash-chained events. Insert-only by construction. */
  async append(records: readonly EventRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    await this.client.db.insert(events).values(records.map(toRow));
  }

  /** All events in seq order — feeds verifyEventChain and buildAuditExport. */
  async all(): Promise<EventRecord[]> {
    const rows = await this.client.db.select().from(events).orderBy(asc(events.seq));
    return rows.map(fromRow);
  }
}
