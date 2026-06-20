/**
 * Reproducible examiner export (Invariant 9; DESIGN.md flow 3).
 *
 * The export is the trust artifact a compliance buyer shows an examiner, so it
 * must be byte-stable: the SAME event range yields an IDENTICAL content checksum,
 * regardless of when it was generated. The checksum is computed over the canonical
 * serialization of the selected events ONLY — the generation timestamp is artifact
 * metadata and is deliberately excluded, so re-exporting the same range always
 * verifies. CSV and JSON render the same events; both carry the same checksum.
 */
import { canonicalStringify, sha256Hex } from './hash';
import type { EventRecord, JsonValue } from './types';

export type ExportFormat = 'csv' | 'json';

export interface AuditExportInput {
  readonly events: readonly EventRecord[];
  readonly format: ExportFormat;
  readonly fromSeq?: number;
  readonly toSeq?: number;
  /** Artifact metadata only — printed in the header, EXCLUDED from the checksum. */
  readonly generatedAt?: string;
}

export interface AuditExport {
  readonly format: ExportFormat;
  readonly eventCount: number;
  readonly fromSeq: number | null;
  readonly toSeq: number | null;
  /** sha256 over the canonical event rows in range — the reproducibility anchor. */
  readonly checksum: string;
  /** Rendered artifact: a metadata header (incl. checksum) followed by the rows. */
  readonly content: string;
}

const CSV_COLUMNS = [
  'seq',
  'occurredAt',
  'actorType',
  'actorId',
  'eventType',
  'payload',
  'prevEventHash',
  'eventHash',
] as const;

/** Plain JSON projection of the events — the exact bytes the checksum covers. */
function canonicalRows(events: readonly EventRecord[]): JsonValue {
  return events.map((event) => ({
    seq: event.seq,
    actorType: event.actorType,
    actorId: event.actorId,
    eventType: event.eventType,
    payload: event.payload,
    occurredAt: event.occurredAt,
    prevEventHash: event.prevEventHash,
    eventHash: event.eventHash,
  }));
}

/** Select the event range [fromSeq, toSeq], sorted by seq (immutably). */
function selectRange(input: AuditExportInput): readonly EventRecord[] {
  const from = input.fromSeq ?? Number.NEGATIVE_INFINITY;
  const to = input.toSeq ?? Number.POSITIVE_INFINITY;
  return input.events
    .filter((event) => event.seq >= from && event.seq <= to)
    .slice()
    .sort((a, b) => a.seq - b.seq);
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(event: EventRecord): string {
  const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
    seq: String(event.seq),
    occurredAt: event.occurredAt,
    actorType: event.actorType,
    actorId: event.actorId,
    eventType: event.eventType,
    payload: canonicalStringify(event.payload),
    prevEventHash: event.prevEventHash ?? '',
    eventHash: event.eventHash,
  };
  return CSV_COLUMNS.map((column) => escapeCsv(cells[column])).join(',');
}

/**
 * Build a reproducible audit export. `checksum` covers only the canonical event
 * rows, so two calls over the same range agree even with different `generatedAt`.
 */
export function buildAuditExport(input: AuditExportInput): AuditExport {
  const selected = selectRange(input);
  const checksum = sha256Hex(canonicalStringify(canonicalRows(selected)));
  const fromSeq = selected.length > 0 ? (selected[0] as EventRecord).seq : null;
  const toSeq = selected.length > 0 ? (selected[selected.length - 1] as EventRecord).seq : null;
  const generatedAt = input.generatedAt ?? 'unspecified';

  const content =
    input.format === 'csv'
      ? renderCsv(selected, { checksum, generatedAt, fromSeq, toSeq })
      : renderJson(selected, { checksum, generatedAt, fromSeq, toSeq });

  return { format: input.format, eventCount: selected.length, fromSeq, toSeq, checksum, content };
}

interface ExportMeta {
  readonly checksum: string;
  readonly generatedAt: string;
  readonly fromSeq: number | null;
  readonly toSeq: number | null;
}

function renderCsv(events: readonly EventRecord[], meta: ExportMeta): string {
  const header = [
    `# RegDelta audit export`,
    `# checksum: ${meta.checksum}`,
    `# range: ${meta.fromSeq ?? '-'}..${meta.toSeq ?? '-'} (${events.length} events)`,
    `# generatedAt: ${meta.generatedAt}`,
  ].join('\n');
  const rows = [CSV_COLUMNS.join(','), ...events.map(toCsvRow)].join('\n');
  return `${header}\n${rows}\n`;
}

function renderJson(events: readonly EventRecord[], meta: ExportMeta): string {
  return `${JSON.stringify(
    {
      artifact: 'regdelta-audit-export',
      checksum: meta.checksum,
      range: { fromSeq: meta.fromSeq, toSeq: meta.toSeq },
      eventCount: events.length,
      generatedAt: meta.generatedAt,
      events,
    },
    null,
    2,
  )}\n`;
}
