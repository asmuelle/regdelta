/**
 * Core domain types for RegDelta (see DESIGN.md "Data model sketch").
 * This package is pure domain logic: no I/O, no network, no database.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type FeedType = 'api' | 'rss' | 'html';
export type SourceStatus = 'active' | 'degraded' | 'unsupported';

/** A monitored primary source. `tosBasis` is mandatory (AGENTS.md Invariant 8). */
export interface SourceDefinition {
  readonly id: string;
  readonly adapterId: string;
  readonly jurisdiction: string;
  readonly agency: string;
  readonly feedType: FeedType;
  readonly url: string;
  readonly crawlSchedule: string;
  readonly freshnessSlaHours: number;
  readonly tosBasis: string;
}

/** Immutable normalized capture of a source at a point in time. */
export interface SnapshotRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly url: string;
  readonly fetchedAt: string;
  readonly contentHash: string;
  readonly normalizedText: string;
}

export type DiffOpKind = 'equal' | 'insert' | 'delete';

export interface DiffOp {
  readonly kind: DiffOpKind;
  readonly text: string;
}

export type DeltaKind = 'new_document' | 'amended';

/** A detected change between snapshots. Detection is deterministic (Invariant 3). */
export interface DeltaRecord {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: DeltaKind;
  readonly fromSnapshotId: string | null;
  readonly toSnapshotId: string;
  readonly ops: readonly DiffOp[];
  readonly detectedAt: string;
}

/** Offset-anchored pin into a stored snapshot (Invariant 1). */
export interface Citation {
  readonly snapshotId: string;
  readonly sourceUrl: string;
  readonly snapshotContentHash: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly quotedText: string;
}

/** A synthesized claim, always backed by exactly one citation. */
export interface Claim {
  readonly text: string;
  readonly citation: Citation;
}

/** ISO `YYYY-MM-DD` date, or the explicit marker when no date is stated. */
export const NONE_STATED = 'none_stated';
export type EffectiveDate = string;

export type Materiality = 'high' | 'normal';
export type ReviewState = 'auto' | 'pending_review' | 'approved' | 'rejected';

export interface ChangeCardDraft {
  readonly id: string;
  readonly deltaId: string;
  readonly companyId: string;
  readonly title: string;
  readonly summary: string;
  readonly requiredAction: string;
  readonly affectedProducts: readonly string[];
  readonly effectiveDate: EffectiveDate;
  readonly deadline: string | null;
  readonly materiality: Materiality;
  readonly redline: readonly DiffOp[];
  readonly claims: readonly Claim[];
}

export interface PublishedChangeCard extends ChangeCardDraft {
  readonly reviewState: ReviewState;
  readonly publishedAt: string | null;
}

export interface EntailmentVerdict {
  readonly claimIndex: number;
  readonly entailed: boolean;
  readonly rationale: string;
}

export interface GateCheck {
  readonly code: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface GateResult {
  readonly status: 'pass' | 'fail';
  readonly route: 'publish' | 'review_queue';
  readonly checks: readonly GateCheck[];
}

export type ActorType = 'system' | 'model' | 'human';

/** Append-only, hash-chained audit log entry (Invariant 4). */
export interface EventRecord {
  readonly seq: number;
  readonly actorType: ActorType;
  readonly actorId: string;
  readonly eventType: string;
  readonly payload: JsonValue;
  readonly occurredAt: string;
  readonly prevEventHash: string | null;
  readonly eventHash: string;
}

export interface CompanyProfile {
  readonly id: string;
  readonly name: string;
  readonly vertical: string;
  readonly products: readonly string[];
  readonly jurisdictions: readonly string[];
  readonly licenseTypes: readonly string[];
  readonly watchTerms: readonly string[];
}

export interface TriageAssessment {
  readonly deltaId: string;
  readonly companyId: string;
  readonly confidence: number;
  readonly threshold: number;
  readonly decision: 'relevant' | 'irrelevant';
  readonly rationale: string;
}
