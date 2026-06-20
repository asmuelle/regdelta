import { buildAuditExport } from '@regdelta/core';
import { runPipeline } from '@regdelta/pipeline';

// Deterministic + offline (mocked models, checked-in fixtures), so the examiner
// export prerenders to a stable static artifact.
export const dynamic = 'force-static';

/** GET /export — the examiner audit artifact (CSV), reproducible by content checksum. */
export async function GET(): Promise<Response> {
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
