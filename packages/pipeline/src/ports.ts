import type {
  Claim,
  CompanyProfile,
  EffectiveDate,
  EntailmentVerdict,
  RegTopic,
  SnapshotRecord,
  TopicAssignment,
} from '@regdelta/core';

/**
 * Model ports — the ONLY seam through which LLMs touch the pipeline.
 * M1 ships deterministic mock implementations only; the build and all tests
 * run without any AI API or network access. A live Anthropic adapter plugs in
 * behind these interfaces post-M1 (see TOOLS.md for env vars).
 */

export interface TopicClassifierInput {
  readonly deltaText: string;
  readonly topics: readonly RegTopic[];
}

export interface TopicClassifierOutput {
  readonly assignments: readonly TopicAssignment[];
}

/**
 * The frontier-cost classification stage: runs ONCE per delta (never per profile)
 * and must see every in-jurisdiction delta — embeddings may rank its queue but
 * never filter it (see @regdelta/core routing). Profiles then map to topics
 * deterministically downstream.
 */
export interface TopicClassifierPort {
  readonly label: string;
  classify(input: TopicClassifierInput): Promise<TopicClassifierOutput>;
}

export interface TriageInput {
  readonly profile: CompanyProfile;
  readonly deltaText: string;
}

export interface TriageOutput {
  readonly confidence: number;
  readonly rationale: string;
}

export interface TriageModelPort {
  readonly label: string;
  assess(input: TriageInput): Promise<TriageOutput>;
}

export interface SynthesisNoticeContext {
  readonly snapshot: SnapshotRecord;
  readonly title: string;
  readonly documentNumber: string;
  readonly effectiveOn: string | null;
}

export interface SynthesisAmendmentContext {
  readonly snapshot: SnapshotRecord;
  readonly sectionCitation: string;
  readonly insertedSegments: readonly string[];
}

export interface SynthesisInput {
  readonly profile: CompanyProfile;
  readonly notice: SynthesisNoticeContext;
  readonly amendment: SynthesisAmendmentContext | null;
}

export interface SynthesisOutput {
  readonly title: string;
  readonly summary: string;
  readonly requiredAction: string;
  readonly affectedProducts: readonly string[];
  readonly effectiveDate: EffectiveDate;
  readonly deadline: string | null;
  readonly claims: readonly Claim[];
}

export interface SynthesisModelPort {
  readonly label: string;
  draft(input: SynthesisInput): Promise<SynthesisOutput>;
}

export interface EntailmentInput {
  readonly claims: readonly Claim[];
  readonly snapshots: ReadonlyMap<string, SnapshotRecord>;
}

export interface EntailmentVerifierPort {
  readonly label: string;
  verify(input: EntailmentInput): Promise<EntailmentVerdict[]>;
}

export interface ModelPorts {
  readonly topicClassifier: TopicClassifierPort;
  readonly triage: TriageModelPort;
  readonly synthesis: SynthesisModelPort;
  readonly entailment: EntailmentVerifierPort;
  readonly provider: string;
}
