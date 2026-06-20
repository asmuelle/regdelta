/**
 * Live Federal Register adapter (public API, no key — TOOLS.md). Fetches the
 * newest matching document for a source's query, then its raw text, and returns
 * the same `AdapterFetchResult` shape the fixture adapter produces — so detection,
 * snapshotting, and the rest of the pipeline are identical for live vs. replay.
 *
 * The risky part is parsing, so the JSON is zod-validated and the adapter is unit-
 * tested offline with canned responses; real network lives behind the HttpClient.
 */
import { z } from 'zod';
import type { SourceDefinition } from '@regdelta/core';
import { AdapterError, type AdapterFetchResult } from '../ingest';
import type { HttpClient } from '../http';

const documentSchema = z.object({
  document_number: z.string().min(1),
  title: z.string().min(1),
  publication_date: z.string().min(1),
  effective_on: z.union([z.string(), z.null()]).optional(),
  html_url: z.string().url(),
  raw_text_url: z.union([z.string().url(), z.null()]).optional(),
});

const listSchema = z.object({
  count: z.number().int().min(0).optional(),
  results: z.array(documentSchema).default([]),
});

export type FederalRegisterDocument = z.infer<typeof documentSchema>;

function parseList(body: string): z.infer<typeof listSchema> {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new AdapterError('Federal Register list response was not valid JSON');
  }
  const result = listSchema.safeParse(json);
  if (!result.success) {
    throw new AdapterError(
      `Federal Register list response failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

/** The newest document in the list that has retrievable raw text. */
function newestWithText(docs: readonly FederalRegisterDocument[]): FederalRegisterDocument {
  const withText = docs
    .filter((doc) => typeof doc.raw_text_url === 'string' && doc.raw_text_url.length > 0)
    .sort((a, b) => (a.publication_date < b.publication_date ? 1 : -1));
  const newest = withText[0];
  if (newest === undefined) {
    throw new AdapterError('Federal Register list contained no document with raw text');
  }
  return newest;
}

/**
 * Fetch the latest Federal Register document for `source.url` (a documents.json
 * query) and its raw text. `now` is the crawl timestamp the caller supplies — the
 * adapter does not read the clock, keeping it testable.
 */
export async function fetchFederalRegisterLatest(
  source: SourceDefinition,
  http: HttpClient,
  now: string,
): Promise<AdapterFetchResult> {
  if (source.adapterId !== 'federal-register') {
    throw new AdapterError(`source "${source.id}" is not a federal-register source`);
  }
  const list = await http.get(source.url);
  if (!list.ok) {
    throw new AdapterError(`Federal Register list fetch failed: HTTP ${list.status}`);
  }
  const doc = newestWithText(parseList(list.text).results);

  const body = await http.get(doc.raw_text_url as string);
  if (!body.ok) {
    throw new AdapterError(`Federal Register raw-text fetch failed: HTTP ${body.status}`);
  }
  if (body.text.trim().length === 0) {
    throw new AdapterError(
      `Federal Register document ${doc.document_number} returned empty raw text`,
    );
  }

  return { source, url: doc.html_url, fetchedAt: now, rawText: body.text };
}
