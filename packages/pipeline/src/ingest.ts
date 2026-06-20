import {
  normalizeText,
  sha256Hex,
  type SnapshotRecord,
  type SourceDefinition,
} from '@regdelta/core';
import {
  ecfrSectionCurrent,
  ecfrSectionPrior,
  federalRegisterCfpbDocument,
  type EcfrSectionFixture,
} from './fixtures';

/** Raised at the adapter boundary; never swallowed (a lost crawl is a coverage gap). */
export class AdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdapterError';
  }
}

export interface AdapterFetchResult {
  readonly source: SourceDefinition;
  readonly url: string;
  readonly fetchedAt: string;
  readonly rawText: string;
}

/**
 * Federal Register adapter — M1 replays the recorded fixture; the live HTTP
 * client plugs in behind the same shape post-M1 (tests stay offline either way).
 */
export function fetchFederalRegisterCfpb(source: SourceDefinition): AdapterFetchResult {
  if (source.adapterId !== 'federal-register') {
    throw new AdapterError(`source "${source.id}" is not a federal-register source`);
  }
  const doc = federalRegisterCfpbDocument;
  return {
    source,
    url: doc.html_url,
    fetchedAt: `${doc.publication_date}T06:00:00.000Z`,
    rawText: doc.full_text,
  };
}

export type EcfrVersion = 'prior' | 'current';

/** eCFR adapter — replays recorded point-in-time section snapshots. */
export function fetchEcfrSection(
  source: SourceDefinition,
  version: EcfrVersion,
): AdapterFetchResult {
  if (source.adapterId !== 'ecfr') {
    throw new AdapterError(`source "${source.id}" is not an ecfr source`);
  }
  const fixture: EcfrSectionFixture = version === 'prior' ? ecfrSectionPrior : ecfrSectionCurrent;
  return {
    source,
    url: fixture.url,
    fetchedAt: fixture.retrieved_at,
    rawText: fixture.text,
  };
}

/** Normalize + content-hash a fetched document into an immutable snapshot. */
export function snapshotFromFetch(fetch: AdapterFetchResult, id: string): SnapshotRecord {
  const normalizedText = normalizeText(fetch.rawText);
  if (normalizedText.length === 0) {
    throw new AdapterError(`fetched document for "${fetch.source.id}" normalized to empty text`);
  }
  return {
    id,
    sourceId: fetch.source.id,
    url: fetch.url,
    fetchedAt: fetch.fetchedAt,
    contentHash: sha256Hex(normalizedText),
    normalizedText,
  };
}
