import { buildAuditExport } from '@regdelta/core';
import { runPipeline } from '@regdelta/pipeline';
import { currentEntitlements } from '../billing';

// Reads entitlements at request time, so it must be dynamic (not prerendered).
export const dynamic = 'force-dynamic';

/** GET /export — the examiner audit artifact (CSV); gated behind the auditExport entitlement. */
export async function GET(): Promise<Response> {
  if (!currentEntitlements().auditExport) {
    return new Response('Examiner export requires a paid plan (Multi-state or Firm).', {
      status: 402, // Payment Required
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const result = await runPipeline();
  // generatedAt is metadata only (excluded from the checksum); pin it to the run's
  // first event so the downloaded file is byte-stable across builds.
  const generatedAt = result.events[0]?.occurredAt ?? '1970-01-01T00:00:00.000Z';
  const exported = buildAuditExport({ events: result.events, format: 'csv', generatedAt });

  return new Response(exported.content, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="regdelta-audit-${exported.checksum.slice(0, 12)}.csv"`,
    },
  });
}
