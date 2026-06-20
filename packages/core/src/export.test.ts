import { describe, expect, it } from 'vitest';
import { appendEvent } from './events';
import { buildAuditExport } from './export';
import type { EventRecord } from './types';

function makeLog(): readonly EventRecord[] {
  let log: readonly EventRecord[] = [];
  log = appendEvent(
    log,
    { actorType: 'system', actorId: 'p', eventType: 'snapshot_recorded', payload: { a: 1 } },
    '2026-06-10T06:00:00.000Z',
  );
  log = appendEvent(
    log,
    { actorType: 'model', actorId: 'm', eventType: 'delta_triaged', payload: { ok: true } },
    '2026-06-10T06:00:01.000Z',
  );
  log = appendEvent(
    log,
    { actorType: 'system', actorId: 'p', eventType: 'card_published', payload: { cardId: 'c-1' } },
    '2026-06-10T06:00:02.000Z',
  );
  return log;
}

describe('buildAuditExport (Invariant 9 — reproducible)', () => {
  it('produces an identical checksum for the same range regardless of generation time', () => {
    // Arrange
    const events = makeLog();

    // Act — same range, different generatedAt.
    const first = buildAuditExport({
      events,
      format: 'csv',
      generatedAt: '2026-06-20T10:00:00.000Z',
    });
    const second = buildAuditExport({
      events,
      format: 'csv',
      generatedAt: '2026-09-01T18:30:00.000Z',
    });

    // Assert
    expect(second.checksum).toBe(first.checksum);
  });

  it('agrees on the checksum across formats (it certifies events, not rendering)', () => {
    const events = makeLog();
    const csv = buildAuditExport({ events, format: 'csv' });
    const json = buildAuditExport({ events, format: 'json' });
    expect(json.checksum).toBe(csv.checksum);
  });

  it('changes the checksum when the selected range changes', () => {
    const events = makeLog();
    const full = buildAuditExport({ events, format: 'json' });
    const partial = buildAuditExport({ events, format: 'json', fromSeq: 1, toSeq: 2 });
    expect(partial.eventCount).toBe(2);
    expect(partial.checksum).not.toBe(full.checksum);
  });

  it('selects an inclusive seq range and reports its bounds', () => {
    const events = makeLog();
    const out = buildAuditExport({ events, format: 'csv', fromSeq: 2, toSeq: 3 });
    expect(out.fromSeq).toBe(2);
    expect(out.toSeq).toBe(3);
    expect(out.eventCount).toBe(2);
  });

  it('prints the checksum on the artifact and excludes generatedAt from it', () => {
    const events = makeLog();
    const out = buildAuditExport({
      events,
      format: 'csv',
      generatedAt: '2026-06-20T10:00:00.000Z',
    });
    expect(out.content).toContain(`# checksum: ${out.checksum}`);
    expect(out.content).toContain('# generatedAt: 2026-06-20T10:00:00.000Z');
  });

  it('renders an empty range as a valid, stable artifact', () => {
    const out = buildAuditExport({ events: [], format: 'json' });
    expect(out.eventCount).toBe(0);
    expect(out.fromSeq).toBeNull();
    expect(out.checksum).toBe(buildAuditExport({ events: [], format: 'csv' }).checksum);
  });
});
