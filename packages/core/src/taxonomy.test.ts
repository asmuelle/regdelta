import { describe, expect, it } from 'vitest';
import {
  relevantDeltasForProfile,
  topicSubscription,
  type RegTopic,
  type TopicAssignment,
} from './taxonomy';
import type { CompanyProfile } from './types';

const regZTopic: RegTopic = {
  id: 'topic-reg-z-disclosure',
  label: 'Reg Z disclosure timing — federal',
  jurisdiction: 'US-FED',
  keywords: ['regulation z', 'truth in lending', 'home equity', 'disclosure', 'open-end credit'],
  expectedAuthorities: [{ agency: 'Consumer Financial Protection Bureau', jurisdiction: 'US-FED' }],
};

const caFinancingTopic: RegTopic = {
  id: 'topic-ca-financing-law',
  label: 'California Financing Law — consumer credit',
  jurisdiction: 'US-CA',
  keywords: ['california financing law', 'consumer credit', 'home equity'],
  expectedAuthorities: [
    {
      agency: 'California Department of Financial Protection and Innovation',
      jurisdiction: 'US-CA',
    },
  ],
};

const swapTopic: RegTopic = {
  id: 'topic-swaps',
  label: 'Swap execution facilities — federal',
  jurisdiction: 'US-FED',
  keywords: ['swap execution facility', 'derivatives clearing'],
  expectedAuthorities: [{ agency: 'Commodity Futures Trading Commission', jurisdiction: 'US-FED' }],
};

const lender: CompanyProfile = {
  id: 'co-1',
  name: 'Meridian',
  vertical: 'consumer_lending',
  products: ['Home equity line of credit (HELOC)'],
  jurisdictions: ['US-FED', 'US-CA'],
  licenseTypes: ['California Financing Law license'],
  watchTerms: ['Regulation Z', 'disclosure'],
};

const TOPICS = [regZTopic, caFinancingTopic, swapTopic];

describe('topicSubscription', () => {
  it('subscribes a lender to overlapping federal and in-state topics', () => {
    const ids = topicSubscription(lender, TOPICS);
    expect(ids).toContain('topic-reg-z-disclosure');
    expect(ids).toContain('topic-ca-financing-law');
  });

  it('does not subscribe to a federal topic with no keyword overlap', () => {
    expect(topicSubscription(lender, TOPICS)).not.toContain('topic-swaps');
  });

  it('excludes an out-of-jurisdiction topic even when keywords overlap', () => {
    const nyTopic: RegTopic = { ...caFinancingTopic, id: 'topic-ny', jurisdiction: 'US-NY' };
    expect(topicSubscription(lender, [nyTopic])).toEqual([]);
  });
});

describe('relevantDeltasForProfile (deterministic fan-out)', () => {
  it('returns deltas assigned to a subscribed topic', () => {
    const assignments = new Map<string, readonly TopicAssignment[]>([
      [
        'delta-a',
        [{ topicId: 'topic-reg-z-disclosure', confidence: 0.9, matchedKeywords: ['disclosure'] }],
      ],
      [
        'delta-b',
        [{ topicId: 'topic-swaps', confidence: 0.8, matchedKeywords: ['swap execution facility'] }],
      ],
    ]);
    expect(relevantDeltasForProfile(lender, TOPICS, assignments)).toEqual(['delta-a']);
  });

  it('never silently drops an UNCLASSIFIED delta (recall-safe taxonomy gap)', () => {
    const assignments = new Map<string, readonly TopicAssignment[]>([['delta-x', []]]);
    expect(relevantDeltasForProfile(lender, TOPICS, assignments)).toEqual(['delta-x']);
  });

  it('classifies each delta once and fans out to many profiles (cost is O(deltas + profiles))', () => {
    // Arrange — 1 delta, 3 profiles. Classification happens once (the map below);
    // fan-out is pure set math, never a per-profile model call.
    const assignments = new Map<string, readonly TopicAssignment[]>([
      [
        'delta-a',
        [{ topicId: 'topic-reg-z-disclosure', confidence: 0.9, matchedKeywords: ['disclosure'] }],
      ],
    ]);
    const profiles = [lender, { ...lender, id: 'co-2' }, { ...lender, id: 'co-3' }];

    // Act
    const perProfile = profiles.map((p) => relevantDeltasForProfile(p, TOPICS, assignments));

    // Assert — all three see the single classified delta, no re-classification.
    expect(perProfile).toEqual([['delta-a'], ['delta-a'], ['delta-a']]);
  });
});
