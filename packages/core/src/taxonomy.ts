/**
 * Regulatory topic taxonomy (DESIGN.md "delta-once-against-taxonomy").
 *
 * The frontier model classifies each delta ONCE into topics; profiles then map
 * to topics deterministically. This collapses triage/synthesis cost from
 * O(deltas × profiles) to O(deltas + profiles) and turns the shared taxonomy +
 * accumulated human decisions into a cross-customer asset. Pure domain logic:
 * the classification model lives behind a pipeline port, never in this package.
 */
import type { CompanyProfile } from './types';

/** An authority (agency × jurisdiction) a topic expects to be monitored. */
export interface ExpectedAuthority {
  readonly agency: string;
  readonly jurisdiction: string;
}

/** A topic-scoped slice of regulation, e.g. "Reg Z disclosure timing — federal". */
export interface RegTopic {
  readonly id: string;
  readonly label: string;
  readonly jurisdiction: string;
  /** Lowercased match terms; recall-biased — any overlap subscribes a profile. */
  readonly keywords: readonly string[];
  /** Authorities that MUST be monitored for this topic (drives coverage completeness). */
  readonly expectedAuthorities: readonly ExpectedAuthority[];
}

/** A delta's classification into one topic, produced once per delta by the cheap model. */
export interface TopicAssignment {
  readonly topicId: string;
  readonly confidence: number;
  readonly matchedKeywords: readonly string[];
}

/** Federal sources are in scope for any US profile regardless of state selection. */
export const FEDERAL_JURISDICTION = 'US-FED';

function lower(value: string): string {
  return value.toLowerCase();
}

/** The full term set a profile is "about" — products, license types, watch terms. */
export function profileTerms(profile: CompanyProfile): readonly string[] {
  return [...profile.products, ...profile.licenseTypes, ...profile.watchTerms].map(lower);
}

function jurisdictionInScope(jurisdiction: string, profile: CompanyProfile): boolean {
  if (jurisdiction === FEDERAL_JURISDICTION) {
    return true;
  }
  return profile.jurisdictions.includes(jurisdiction);
}

function keywordOverlap(topic: RegTopic, terms: readonly string[]): boolean {
  return topic.keywords.some((keyword) => {
    const k = lower(keyword);
    return terms.some((term) => term.includes(k) || k.includes(term));
  });
}

/**
 * Topics a profile subscribes to: jurisdiction must be in scope AND at least one
 * keyword must overlap a profile term. Deterministic — no model involved.
 */
export function topicSubscription(
  profile: CompanyProfile,
  topics: readonly RegTopic[],
): readonly string[] {
  const terms = profileTerms(profile);
  return topics
    .filter(
      (topic) => jurisdictionInScope(topic.jurisdiction, profile) && keywordOverlap(topic, terms),
    )
    .map((topic) => topic.id);
}

/**
 * Deterministic fan-out: given each delta's topic assignments and the profiles,
 * return the delta ids relevant to a single profile. Recall-safe — a delta with
 * NO topic assignment at all (a possible taxonomy blind spot) is returned too,
 * so a model can never silently route an unclassified change away from triage.
 */
export function relevantDeltasForProfile(
  profile: CompanyProfile,
  topics: readonly RegTopic[],
  assignmentsByDelta: ReadonlyMap<string, readonly TopicAssignment[]>,
): readonly string[] {
  const subscribed = new Set(topicSubscription(profile, topics));
  const relevant: string[] = [];
  for (const [deltaId, assignments] of assignmentsByDelta) {
    if (assignments.length === 0) {
      relevant.push(deltaId); // unclassified → never silently dropped
      continue;
    }
    if (assignments.some((assignment) => subscribed.has(assignment.topicId))) {
      relevant.push(deltaId);
    }
  }
  return relevant;
}
