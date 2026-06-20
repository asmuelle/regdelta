/**
 * Source-set completeness (DESIGN.md Risk 1 — the omission risk freshness misses).
 *
 * `evaluateFreshness` answers "are the sources we monitor live?". It cannot answer
 * "are we monitoring the RIGHT sources?" — the fatal omission is a relevant rule
 * arriving from an authority we never watch. This module measures that: for every
 * topic a profile subscribes to, each expected authority must map to a monitored
 * source, or it is a blind spot — surfaced as completeness, distinct from liveness.
 */
import { topicSubscription, type ExpectedAuthority, type RegTopic } from './taxonomy';
import type { CompanyProfile, SourceDefinition } from './types';

export interface CoverageBlindSpot {
  readonly topicId: string;
  readonly agency: string;
  readonly jurisdiction: string;
  readonly reason: string;
}

export interface CoverageCompletenessReport {
  readonly subscribedTopicIds: readonly string[];
  readonly coveredAuthorities: readonly ExpectedAuthority[];
  readonly blindSpots: readonly CoverageBlindSpot[];
  readonly complete: boolean;
}

function isMonitored(authority: ExpectedAuthority, sources: readonly SourceDefinition[]): boolean {
  return sources.some(
    (source) =>
      source.agency === authority.agency && source.jurisdiction === authority.jurisdiction,
  );
}

/**
 * Cross-check a profile's subscribed topics against the monitored source set.
 * A subscribed topic whose expected authority has no monitored source is a blind
 * spot. `complete` is true only when every expected authority is covered.
 */
export function assessCoverageCompleteness(input: {
  readonly profile: CompanyProfile;
  readonly topics: readonly RegTopic[];
  readonly sources: readonly SourceDefinition[];
}): CoverageCompletenessReport {
  const subscribedTopicIds = topicSubscription(input.profile, input.topics);
  const subscribed = new Set(subscribedTopicIds);
  const covered: ExpectedAuthority[] = [];
  const blindSpots: CoverageBlindSpot[] = [];

  for (const topic of input.topics) {
    if (!subscribed.has(topic.id)) {
      continue;
    }
    for (const authority of topic.expectedAuthorities) {
      if (isMonitored(authority, input.sources)) {
        covered.push(authority);
      } else {
        blindSpots.push({
          topicId: topic.id,
          agency: authority.agency,
          jurisdiction: authority.jurisdiction,
          reason: `no monitored source for ${authority.agency} (${authority.jurisdiction})`,
        });
      }
    }
  }

  return {
    subscribedTopicIds,
    coveredAuthorities: covered,
    blindSpots,
    complete: blindSpots.length === 0,
  };
}
