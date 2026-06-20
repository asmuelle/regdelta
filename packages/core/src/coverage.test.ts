import { describe, expect, it } from 'vitest';
import { assessCoverageCompleteness } from './coverage';
import type { RegTopic } from './taxonomy';
import type { CompanyProfile, SourceDefinition } from './types';

const regZTopic: RegTopic = {
  id: 'topic-reg-z-disclosure',
  label: 'Reg Z disclosure timing — federal',
  jurisdiction: 'US-FED',
  keywords: ['regulation z', 'disclosure', 'home equity'],
  expectedAuthorities: [{ agency: 'Consumer Financial Protection Bureau', jurisdiction: 'US-FED' }],
};

const caTopic: RegTopic = {
  id: 'topic-ca-financing-law',
  label: 'California Financing Law',
  jurisdiction: 'US-CA',
  keywords: ['california financing law', 'consumer credit', 'home equity'],
  expectedAuthorities: [
    {
      agency: 'California Department of Financial Protection and Innovation',
      jurisdiction: 'US-CA',
    },
  ],
};

const profile: CompanyProfile = {
  id: 'co-1',
  name: 'Meridian',
  vertical: 'consumer_lending',
  products: ['Home equity line of credit (HELOC)'],
  jurisdictions: ['US-FED', 'US-CA'],
  licenseTypes: ['California Financing Law license'],
  watchTerms: ['Regulation Z', 'disclosure'],
};

const federalSource: SourceDefinition = {
  id: 'src-fr-cfpb',
  adapterId: 'federal-register',
  jurisdiction: 'US-FED',
  agency: 'Consumer Financial Protection Bureau',
  feedType: 'api',
  url: 'https://example.gov/fr',
  crawlSchedule: '0 6 * * *',
  freshnessSlaHours: 36,
  tosBasis: 'public domain',
};

describe('assessCoverageCompleteness (DESIGN.md Risk 1 — completeness, not just liveness)', () => {
  it('flags a subscribed topic whose authority is not monitored as a blind spot', () => {
    // Arrange — profile covers CA, but only the federal source is monitored.
    const report = assessCoverageCompleteness({
      profile,
      topics: [regZTopic, caTopic],
      sources: [federalSource],
    });

    // Assert — federal covered, California is a blind spot, not silently "covered".
    expect(report.complete).toBe(false);
    expect(report.blindSpots).toHaveLength(1);
    expect(report.blindSpots[0]?.jurisdiction).toBe('US-CA');
    expect(report.coveredAuthorities).toContainEqual({
      agency: 'Consumer Financial Protection Bureau',
      jurisdiction: 'US-FED',
    });
  });

  it('reports complete coverage when every expected authority is monitored', () => {
    const caSource: SourceDefinition = {
      ...federalSource,
      id: 'src-ca-dfpi',
      jurisdiction: 'US-CA',
      agency: 'California Department of Financial Protection and Innovation',
    };
    const report = assessCoverageCompleteness({
      profile,
      topics: [regZTopic, caTopic],
      sources: [federalSource, caSource],
    });
    expect(report.complete).toBe(true);
    expect(report.blindSpots).toEqual([]);
  });
});
