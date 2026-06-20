/**
 * Live eCFR adapter (public API, no key). The versioner API returns point-in-time
 * title XML; we extract a single section's text and return the same
 * `AdapterFetchResult` shape as the fixture/FR adapters, so diff + snapshot are
 * identical for live vs. replay. The section-extraction is the risky part, so it
 * is a pure function unit-tested with canned XML; real network lives behind HttpClient.
 *
 * NOTE: extraction is tag-stripping over the matched <DIV8 N="..."> node. Validate
 * against live eCFR XML before trusting in production; a real XML parser may be
 * warranted as section shapes vary.
 */
import type { SourceDefinition } from '@regdelta/core';
import { AdapterError, type AdapterFetchResult } from '../ingest';
import type { HttpClient } from '../http';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Build the eCFR versioner URL for a title on a given date. */
export function ecfrTitleUrl(title: number, date: string): string {
  if (!ISO_DATE.test(date)) {
    throw new AdapterError(`eCFR date must be YYYY-MM-DD, got "${date}"`);
  }
  return `https://www.ecfr.gov/api/versioner/v1/full/${date}/title-${title}.xml`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8217;|&rsquo;/g, '’')
    .replace(/&#8220;|&ldquo;/g, '“')
    .replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&nbsp;/g, ' ')
    .replace(/&sect;/g, '§');
}

/**
 * Extract the text of one section (e.g. "1026.40") from eCFR title XML. Finds the
 * `<DIV8 N="<section>" ...>…</DIV8>` node and strips tags. Throws if not found.
 */
export function extractEcfrSectionText(xml: string, section: string): string {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const div = new RegExp(`<DIV8\\b[^>]*\\bN="${escaped}"[\\s\\S]*?</DIV8>`, 'i').exec(xml);
  if (div === null) {
    throw new AdapterError(`eCFR section "${section}" not found in title XML`);
  }
  const text = decodeEntities(div[0].replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) {
    throw new AdapterError(`eCFR section "${section}" extracted to empty text`);
  }
  return text;
}

/**
 * Fetch a section's current text from eCFR for a given date. `now` is the crawl
 * timestamp the caller supplies; `section`/`title`/`date` parameterise the lookup.
 */
export async function fetchEcfrSectionLive(
  source: SourceDefinition,
  http: HttpClient,
  params: { readonly title: number; readonly section: string; readonly date: string },
  now: string,
): Promise<AdapterFetchResult> {
  if (source.adapterId !== 'ecfr') {
    throw new AdapterError(`source "${source.id}" is not an ecfr source`);
  }
  const url = ecfrTitleUrl(params.title, params.date);
  const res = await http.get(url, { accept: 'application/xml, text/xml' });
  if (!res.ok) {
    throw new AdapterError(`eCFR fetch failed: HTTP ${res.status}`);
  }
  return {
    source,
    url: source.url,
    fetchedAt: now,
    rawText: extractEcfrSectionText(res.text, params.section),
  };
}
