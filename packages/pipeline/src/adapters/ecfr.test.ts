import { describe, expect, it } from 'vitest';
import { AdapterError, snapshotFromFetch } from '../ingest';
import { ecfrTitle12Section102640Source } from '../sources';
import type { HttpClient, HttpResponse } from '../http';
import { ecfrTitleUrl, extractEcfrSectionText, fetchEcfrSectionLive } from './ecfr';

const TITLE_XML = `<?xml version="1.0"?>
<DIV5 N="1026">
  <DIV8 N="1026.39" TYPE="SECTION"><HEAD>§ 1026.39 Mortgage transfer.</HEAD><P>Other section.</P></DIV8>
  <DIV8 N="1026.40" TYPE="SECTION">
    <HEAD>§ 1026.40 Requirements for home equity plans.</HEAD>
    <P>(b) The disclosures and brochure shall be delivered not later than three business days.</P>
  </DIV8>
</DIV5>`;

function http(response: HttpResponse): HttpClient {
  return { get: () => Promise.resolve(response), post: () => Promise.resolve(response) };
}

describe('extractEcfrSectionText', () => {
  it('extracts only the requested section and strips tags', () => {
    const text = extractEcfrSectionText(TITLE_XML, '1026.40');
    expect(text).toContain('home equity plans');
    expect(text).toContain('three business days');
    expect(text).not.toContain('Mortgage transfer'); // the adjacent §1026.39 is excluded
    expect(text).not.toContain('<P>');
  });

  it('throws when the section is absent', () => {
    expect(() => extractEcfrSectionText(TITLE_XML, '1026.99')).toThrow(AdapterError);
  });
});

describe('ecfrTitleUrl', () => {
  it('builds a versioner URL and rejects a bad date', () => {
    expect(ecfrTitleUrl(12, '2026-06-08')).toBe(
      'https://www.ecfr.gov/api/versioner/v1/full/2026-06-08/title-12.xml',
    );
    expect(() => ecfrTitleUrl(12, '06/08/2026')).toThrow(AdapterError);
  });
});

describe('fetchEcfrSectionLive (offline, fake HTTP)', () => {
  const NOW = '2026-06-20T05:00:00.000Z';

  it('fetches and snapshots the section text', async () => {
    const result = await fetchEcfrSectionLive(
      ecfrTitle12Section102640Source,
      http({ status: 200, ok: true, text: TITLE_XML }),
      { title: 12, section: '1026.40', date: '2026-06-08' },
      NOW,
    );
    expect(result.fetchedAt).toBe(NOW);
    expect(result.rawText).toContain('three business days');
    const snapshot = snapshotFromFetch(result, 'snap-live-ecfr');
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('errors on a non-200 response', async () => {
    await expect(
      fetchEcfrSectionLive(
        ecfrTitle12Section102640Source,
        http({ status: 502, ok: false, text: 'bad gateway' }),
        { title: 12, section: '1026.40', date: '2026-06-08' },
        NOW,
      ),
    ).rejects.toThrow(/HTTP 502/);
  });
});
