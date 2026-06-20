import type { RegTopic } from '@regdelta/core';

/**
 * Seed topic taxonomy for the M1 vertical (consumer lending). Deltas are
 * classified once into these topics; profiles subscribe deterministically
 * (DESIGN.md "delta-once-against-taxonomy"). `expectedAuthorities` drive the
 * coverage-completeness check: the federal authority is monitored by M1 sources;
 * the California authority is intentionally NOT yet monitored, so a CA-exposed
 * profile surfaces a coverage blind spot rather than a silent gap (Risk 1).
 */
export const regZDisclosureTopic: RegTopic = {
  id: 'topic-reg-z-disclosure',
  label: 'Regulation Z / TILA disclosure timing — federal',
  jurisdiction: 'US-FED',
  keywords: [
    'regulation z',
    'truth in lending',
    'disclosure',
    'home equity',
    'open-end credit',
    'consumer credit',
    'heloc',
  ],
  expectedAuthorities: [{ agency: 'Consumer Financial Protection Bureau', jurisdiction: 'US-FED' }],
};

export const californiaFinancingLawTopic: RegTopic = {
  id: 'topic-ca-financing-law',
  label: 'California Financing Law — consumer credit',
  jurisdiction: 'US-CA',
  keywords: ['california financing law', 'consumer credit', 'home equity', 'disclosure'],
  expectedAuthorities: [
    {
      agency: 'California Department of Financial Protection and Innovation',
      jurisdiction: 'US-CA',
    },
  ],
};

export const CONSUMER_LENDING_TOPICS: readonly RegTopic[] = [
  regZDisclosureTopic,
  californiaFinancingLawTopic,
];
