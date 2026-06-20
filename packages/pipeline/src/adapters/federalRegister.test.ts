import { describe, expect, it } from 'vitest';
import { AdapterError, snapshotFromFetch } from '../ingest';
import { federalRegisterCfpbSource } from '../sources';
import type { HttpClient, HttpResponse } from '../http';
import { fetchFederalRegisterLatest } from './federalRegister';

function ok(text: string): HttpResponse {
  return { status: 200, ok: true, text };
}

/** Fake client: route URLs to canned responses; record what was requested. */
function fakeHttp(routes: Record<string, HttpResponse>): HttpClient {
  const lookup = (url: string): Promise<HttpResponse> => {
    const match = Object.entries(routes).find(([key]) => url.includes(key));
    return Promise.resolve(
      match === undefined ? { status: 404, ok: false, text: `no route for ${url}` } : match[1],
    );
  };
  return { get: lookup, post: (url) => lookup(url) };
}

const RAW_TEXT_URL =
  'https://www.federalregister.gov/documents/full_text/text/2026/06/08/2026-09812.txt';
const listJson = JSON.stringify({
  count: 2,
  results: [
    {
      document_number: '2026-09812',
      title: 'Truth in Lending (Regulation Z); Home Equity Plan Disclosure Timing',
      publication_date: '2026-06-08',
      effective_on: '2026-10-01',
      html_url: 'https://www.federalregister.gov/documents/2026/06/08/2026-09812/x',
      raw_text_url: RAW_TEXT_URL,
    },
    {
      document_number: '2026-00001',
      title: 'An older rule',
      publication_date: '2026-01-02',
      effective_on: null,
      html_url: 'https://www.federalregister.gov/documents/2026/01/02/2026-00001/y',
      raw_text_url:
        'https://www.federalregister.gov/documents/full_text/text/2026/01/02/2026-00001.txt',
    },
  ],
});
const NOW = '2026-06-20T06:00:00.000Z';

describe('fetchFederalRegisterLatest (offline, fake HTTP)', () => {
  it('selects the newest document with raw text and returns a fetch result', async () => {
    const http = fakeHttp({
      'documents.json': ok(listJson),
      [RAW_TEXT_URL]: ok(
        'SUMMARY: The Bureau is amending Regulation Z. The rule is effective October 1, 2026.',
      ),
    });

    const result = await fetchFederalRegisterLatest(federalRegisterCfpbSource, http, NOW);

    expect(result.url).toContain('2026-09812'); // newest by publication_date, not the 2026-00001 doc
    expect(result.fetchedAt).toBe(NOW);
    expect(result.rawText).toContain('Regulation Z');
    // It flows into a valid, content-hashed snapshot like any fixture fetch.
    const snapshot = snapshotFromFetch(result, 'snap-live-fr');
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a source that is not a federal-register adapter', async () => {
    const ecfrSource = { ...federalRegisterCfpbSource, adapterId: 'ecfr' };
    await expect(fetchFederalRegisterLatest(ecfrSource, fakeHttp({}), NOW)).rejects.toThrow(
      AdapterError,
    );
  });

  it('errors when the list has no document with raw text', async () => {
    const noText = JSON.stringify({
      results: [
        {
          document_number: 'x',
          title: 't',
          publication_date: '2026-06-08',
          html_url: 'https://www.federalregister.gov/documents/2026/06/08/x/z',
          raw_text_url: null,
        },
      ],
    });
    const http = fakeHttp({ 'documents.json': ok(noText) });
    await expect(fetchFederalRegisterLatest(federalRegisterCfpbSource, http, NOW)).rejects.toThrow(
      /no document with raw text/i,
    );
  });

  it('errors on a non-200 list response (a lost crawl is never swallowed)', async () => {
    const http = fakeHttp({ 'documents.json': { status: 503, ok: false, text: 'down' } });
    await expect(fetchFederalRegisterLatest(federalRegisterCfpbSource, http, NOW)).rejects.toThrow(
      /HTTP 503/,
    );
  });
});
