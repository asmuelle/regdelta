import { InvariantViolationError, type SourceDefinition } from '@regdelta/core';

/**
 * Source registry. Invariant 8: every source records its permissible-access
 * basis (`tosBasis`); registration of a source without one is rejected.
 */
export function registerSources(
  definitions: readonly SourceDefinition[],
): ReadonlyMap<string, SourceDefinition> {
  const registry = new Map<string, SourceDefinition>();
  for (const definition of definitions) {
    if (definition.tosBasis.trim().length === 0) {
      throw new InvariantViolationError(
        'INV8_TOS_BASIS',
        `source "${definition.id}" has no tosBasis — crawl only what we may crawl (AGENTS.md Invariant 8)`,
      );
    }
    if (registry.has(definition.id)) {
      throw new InvariantViolationError(
        'SOURCE_ID_DUPLICATE',
        `source id "${definition.id}" registered twice`,
      );
    }
    registry.set(definition.id, definition);
  }
  return registry;
}

/** Federal Register API, filtered to CFPB documents (M1 primary adapter). */
export const federalRegisterCfpbSource: SourceDefinition = {
  id: 'src-federal-register-cfpb',
  adapterId: 'federal-register',
  jurisdiction: 'US-FED',
  agency: 'Consumer Financial Protection Bureau',
  feedType: 'api',
  url: 'https://www.federalregister.gov/api/v1/documents.json?conditions%5Bagencies%5D%5B%5D=consumer-financial-protection-bureau',
  crawlSchedule: '0 6 * * *',
  freshnessSlaHours: 36,
  tosBasis:
    'US Government work in the public domain; documented public API (federalregister.gov/developers)',
};

/** eCFR Title 12 §1026.40 point-in-time snapshots (redline base). */
export const ecfrTitle12Section102640Source: SourceDefinition = {
  id: 'src-ecfr-12-cfr-1026-40',
  adapterId: 'ecfr',
  jurisdiction: 'US-FED',
  agency: 'Consumer Financial Protection Bureau',
  feedType: 'api',
  url: 'https://www.ecfr.gov/current/title-12/chapter-X/part-1026/subpart-B/section-1026.40',
  crawlSchedule: '0 5 * * *',
  freshnessSlaHours: 36,
  tosBasis: 'US Government work in the public domain; documented bulk access (ecfr.gov/developers)',
};

export const M1_SOURCES: readonly SourceDefinition[] = [
  federalRegisterCfpbSource,
  ecfrTitle12Section102640Source,
];
