import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { changeCards, companies, deltas, events, snapshots, sources } from './schema';

// Schema-shape tests run without Postgres (AGENTS.md: unit tests never need a live DB).

describe('db schema', () => {
  it('makes a source without a tosBasis unrepresentable (Invariant 8)', () => {
    // Arrange
    const { columns } = getTableConfig(sources);

    // Act
    const tosBasis = columns.find((column) => column.name === 'tos_basis');

    // Assert
    expect(tosBasis).toBeDefined();
    expect(tosBasis?.notNull).toBe(true);
  });

  it('carries the hash chain on the append-only events table (Invariant 4)', () => {
    // Arrange
    const { columns, name } = getTableConfig(events);
    const byName = new Map(columns.map((column) => [column.name, column]));

    // Act
    const eventHash = byName.get('event_hash');
    const prevEventHash = byName.get('prev_event_hash');
    const seq = byName.get('seq');

    // Assert
    expect(name).toBe('events');
    expect(seq?.primary).toBe(true);
    expect(eventHash?.notNull).toBe(true);
    expect(prevEventHash?.notNull).toBe(false); // null exactly once, at the chain root
  });

  it('requires provenance columns on snapshots and change cards (Invariant 1)', () => {
    // Arrange
    const snapshotColumns = getTableConfig(snapshots).columns;
    const cardColumns = getTableConfig(changeCards).columns;
    const required = (cols: typeof snapshotColumns, colName: string): boolean =>
      cols.some((column) => column.name === colName && column.notNull);

    // Act + Assert
    expect(required(snapshotColumns, 'content_hash')).toBe(true);
    expect(required(snapshotColumns, 'normalized_text')).toBe(true);
    expect(required(cardColumns, 'claims')).toBe(true);
    expect(required(cardColumns, 'effective_date')).toBe(true);
  });

  it('defines the projection tables for the M1 slice', () => {
    // Arrange + Act
    const names = [sources, companies, snapshots, deltas, changeCards, events].map(
      (table) => getTableConfig(table).name,
    );

    // Assert
    expect(names).toEqual([
      'sources',
      'companies',
      'snapshots',
      'deltas',
      'change_cards',
      'events',
    ]);
  });
});
