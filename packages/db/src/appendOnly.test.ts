import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Invariant 4 guard at the migration level. The live-DB proof (UPDATE/DELETE
 * raises) runs against Postgres; this offline test ensures the enforcement SQL
 * itself is never silently dropped from the migration set.
 */
const migrationSql = readFileSync(
  fileURLToPath(new URL('../drizzle/0001_event_log_append_only.sql', import.meta.url)),
  'utf8',
);

const journal = JSON.parse(
  readFileSync(fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url)), 'utf8'),
) as { entries: { tag: string }[] };

describe('event log append-only migration (Invariant 4)', () => {
  it('installs a BEFORE UPDATE OR DELETE trigger on the events table', () => {
    expect(migrationSql).toMatch(/BEFORE UPDATE OR DELETE ON "events"/);
    expect(migrationSql).toMatch(/RAISE EXCEPTION/);
  });

  it('revokes mutation grants from PUBLIC as defence in depth', () => {
    expect(migrationSql).toMatch(/REVOKE UPDATE, DELETE ON "events" FROM PUBLIC/);
  });

  it('is registered in the drizzle journal so migrate applies it', () => {
    expect(journal.entries.map((entry) => entry.tag)).toContain('0001_event_log_append_only');
  });
});
