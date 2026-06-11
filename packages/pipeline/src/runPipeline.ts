import {
  DEFAULT_TRIAGE_THRESHOLD,
  decideTriage,
  evaluateGate,
  insertedSegments,
  isoAddSeconds,
  scoreMateriality,
  type ChangeCardDraft,
  type CompanyProfile,
  type DeltaRecord,
  type EventRecord,
  type GateResult,
  type PublishedChangeCard,
  type SnapshotRecord,
  type SourceDefinition,
  type TriageAssessment,
} from '@regdelta/core';
import { appendEvent, type EventInput } from '@regdelta/core';
import { detectDelta } from './detect';
import { ecfrSectionCurrent, consumerLendingProfile, federalRegisterCfpbDocument } from './fixtures';
import { fetchEcfrSection, fetchFederalRegisterCfpb, snapshotFromFetch } from './ingest';
import { createModelPorts } from './mocks';
import type { ModelPorts } from './ports';
import { M1_SOURCES, registerSources } from './sources';

export const PIPELINE_BASE_TIME = '2026-06-10T06:00:00.000Z';
export const PIPELINE_ACTOR_SYSTEM = 'pipeline@m1-slice';

export interface GatedCard {
  readonly card: PublishedChangeCard;
  readonly gate: GateResult;
}

export interface PipelineRunResult {
  readonly profile: CompanyProfile;
  readonly provider: string;
  readonly sources: readonly SourceDefinition[];
  readonly snapshots: ReadonlyMap<string, SnapshotRecord>;
  readonly deltas: readonly DeltaRecord[];
  readonly triages: readonly TriageAssessment[];
  readonly published: readonly GatedCard[];
  readonly reviewQueue: readonly GatedCard[];
  readonly events: readonly EventRecord[];
}

export interface PipelineOptions {
  readonly ports?: ModelPorts;
  readonly profile?: CompanyProfile;
  readonly triageThreshold?: number;
  readonly startedAt?: string;
}

interface Recorder {
  readonly record: (input: EventInput) => void;
  readonly now: () => string;
  readonly all: () => readonly EventRecord[];
}

/** Deterministic replay clock + immutable event accumulator. */
function makeRecorder(startIso: string): Recorder {
  let tick = 0;
  let log: readonly EventRecord[] = [];
  const now = (): string => {
    const stamp = isoAddSeconds(startIso, tick);
    tick += 1;
    return stamp;
  };
  return {
    now,
    record: (input) => {
      log = appendEvent(log, input, now());
    },
    all: () => log,
  };
}

function systemEvent(eventType: string, payload: EventInput['payload']): EventInput {
  return { actorType: 'system', actorId: PIPELINE_ACTOR_SYSTEM, eventType, payload };
}

interface IngestedSlice {
  readonly frSnapshot: SnapshotRecord;
  readonly ecfrPrior: SnapshotRecord;
  readonly ecfrCurrent: SnapshotRecord;
  readonly snapshots: ReadonlyMap<string, SnapshotRecord>;
}

function ingestSlice(
  registry: ReadonlyMap<string, SourceDefinition>,
  recorder: Recorder,
): IngestedSlice {
  const frSource = registry.get('src-federal-register-cfpb');
  const ecfrSource = registry.get('src-ecfr-12-cfr-1026-40');
  if (frSource === undefined || ecfrSource === undefined) {
    throw new Error('M1 sources missing from registry');
  }
  const frSnapshot = snapshotFromFetch(fetchFederalRegisterCfpb(frSource), 'snap-fr-2026-09812');
  const ecfrPrior = snapshotFromFetch(fetchEcfrSection(ecfrSource, 'prior'), 'snap-ecfr-1026-40-prior');
  const ecfrCurrent = snapshotFromFetch(
    fetchEcfrSection(ecfrSource, 'current'),
    'snap-ecfr-1026-40-current',
  );
  for (const snapshot of [frSnapshot, ecfrPrior, ecfrCurrent]) {
    recorder.record(
      systemEvent('snapshot_recorded', {
        snapshotId: snapshot.id,
        sourceId: snapshot.sourceId,
        contentHash: snapshot.contentHash,
        url: snapshot.url,
      }),
    );
  }
  const snapshots = new Map<string, SnapshotRecord>(
    [frSnapshot, ecfrPrior, ecfrCurrent].map((s) => [s.id, s]),
  );
  return { frSnapshot, ecfrPrior, ecfrCurrent, snapshots };
}

function detectSlice(slice: IngestedSlice, recorder: Recorder): DeltaRecord[] {
  const candidates = [
    detectDelta({
      id: 'delta-fr-2026-09812',
      prior: null,
      current: slice.frSnapshot,
      detectedAt: recorder.now(),
    }),
    detectDelta({
      id: 'delta-ecfr-1026-40',
      prior: slice.ecfrPrior,
      current: slice.ecfrCurrent,
      detectedAt: recorder.now(),
    }),
  ];
  const deltas = candidates.filter((delta): delta is DeltaRecord => delta !== null);
  for (const delta of deltas) {
    recorder.record(
      systemEvent('delta_detected', {
        deltaId: delta.id,
        sourceId: delta.sourceId,
        kind: delta.kind,
        fromSnapshotId: delta.fromSnapshotId,
        toSnapshotId: delta.toSnapshotId,
        opCount: delta.ops.length,
      }),
    );
  }
  return deltas;
}

async function triageSlice(
  deltas: readonly DeltaRecord[],
  slice: IngestedSlice,
  profile: CompanyProfile,
  ports: ModelPorts,
  threshold: number,
  recorder: Recorder,
): Promise<TriageAssessment[]> {
  const triages: TriageAssessment[] = [];
  for (const delta of deltas) {
    const current = slice.snapshots.get(delta.toSnapshotId);
    if (current === undefined) {
      throw new Error(`delta ${delta.id} references unknown snapshot ${delta.toSnapshotId}`);
    }
    const output = await ports.triage.assess({ profile, deltaText: current.normalizedText });
    const decision = decideTriage(output.confidence, threshold);
    const assessment: TriageAssessment = {
      deltaId: delta.id,
      companyId: profile.id,
      confidence: output.confidence,
      threshold,
      decision,
      rationale: output.rationale,
    };
    triages.push(assessment);
    // Dismissals are logged too — every triage decision is auditable (Invariant 6).
    recorder.record({
      actorType: 'model',
      actorId: ports.triage.label,
      eventType: 'delta_triaged',
      payload: { ...assessment },
    });
  }
  return triages;
}

async function synthesizeCard(
  slice: IngestedSlice,
  deltas: readonly DeltaRecord[],
  triages: readonly TriageAssessment[],
  profile: CompanyProfile,
  ports: ModelPorts,
  recorder: Recorder,
): Promise<ChangeCardDraft | null> {
  const frDelta = deltas.find((delta) => delta.kind === 'new_document');
  const frTriage = triages.find((t) => t.deltaId === frDelta?.id);
  if (frDelta === undefined || frTriage === undefined || frTriage.decision !== 'relevant') {
    return null;
  }
  const ecfrDelta = deltas.find(
    (delta) =>
      delta.kind === 'amended' &&
      triages.some((t) => t.deltaId === delta.id && t.decision === 'relevant'),
  );
  const draft = await ports.synthesis.draft({
    profile,
    notice: {
      snapshot: slice.frSnapshot,
      title: federalRegisterCfpbDocument.title,
      documentNumber: federalRegisterCfpbDocument.document_number,
      effectiveOn: federalRegisterCfpbDocument.effective_on,
    },
    amendment:
      ecfrDelta !== undefined
        ? {
            snapshot: slice.ecfrCurrent,
            sectionCitation: ecfrSectionCurrent.section,
            insertedSegments: insertedSegments(ecfrDelta.ops),
          }
        : null,
  });
  const card: ChangeCardDraft = {
    id: `card-${frDelta.id}`,
    deltaId: frDelta.id,
    companyId: profile.id,
    title: draft.title,
    summary: draft.summary,
    requiredAction: draft.requiredAction,
    affectedProducts: draft.affectedProducts,
    effectiveDate: draft.effectiveDate,
    deadline: draft.deadline,
    materiality: scoreMateriality({
      effectiveDate: draft.effectiveDate,
      now: frDelta.detectedAt,
      text: slice.frSnapshot.normalizedText,
    }),
    redline: ecfrDelta !== undefined ? ecfrDelta.ops : frDelta.ops,
    claims: draft.claims,
  };
  recorder.record({
    actorType: 'model',
    actorId: ports.synthesis.label,
    eventType: 'card_drafted',
    payload: { cardId: card.id, deltaId: card.deltaId, claimCount: card.claims.length },
  });
  return card;
}

async function gateCard(
  card: ChangeCardDraft,
  slice: IngestedSlice,
  ports: ModelPorts,
  recorder: Recorder,
): Promise<{ gated: GatedCard; route: GateResult['route'] }> {
  const verdicts = await ports.entailment.verify({ claims: card.claims, snapshots: slice.snapshots });
  const gate = evaluateGate({ card, snapshots: slice.snapshots, verdicts });
  recorder.record(
    systemEvent('gate_evaluated', {
      cardId: card.id,
      status: gate.status,
      route: gate.route,
      failedChecks: gate.checks.filter((check) => !check.passed).map((check) => check.code),
    }),
  );
  if (gate.route === 'publish') {
    const published: PublishedChangeCard = { ...card, reviewState: 'auto', publishedAt: recorder.now() };
    recorder.record(
      systemEvent('card_published', { cardId: card.id, publishedAt: published.publishedAt }),
    );
    return { gated: { card: published, gate }, route: 'publish' };
  }
  const queued: PublishedChangeCard = { ...card, reviewState: 'pending_review', publishedAt: null };
  recorder.record(systemEvent('card_routed_to_review', { cardId: card.id }));
  return { gated: { card: queued, gate }, route: 'review_queue' };
}

/**
 * The M1 vertical slice: ingest → diff → triage → synthesize → gate → publish,
 * end-to-end against checked-in fixtures. Deterministic by construction —
 * model ports default to mocks and no step performs I/O.
 */
export async function runPipeline(options: PipelineOptions = {}): Promise<PipelineRunResult> {
  const ports = options.ports ?? createModelPorts();
  const profile = options.profile ?? consumerLendingProfile;
  const threshold = options.triageThreshold ?? DEFAULT_TRIAGE_THRESHOLD;
  const recorder = makeRecorder(options.startedAt ?? PIPELINE_BASE_TIME);

  const registry = registerSources(M1_SOURCES);
  const slice = ingestSlice(registry, recorder);
  const deltas = detectSlice(slice, recorder);
  const triages = await triageSlice(deltas, slice, profile, ports, threshold, recorder);
  const card = await synthesizeCard(slice, deltas, triages, profile, ports, recorder);

  const published: GatedCard[] = [];
  const reviewQueue: GatedCard[] = [];
  if (card !== null) {
    const { gated, route } = await gateCard(card, slice, ports, recorder);
    if (route === 'publish') {
      published.push(gated);
    } else {
      reviewQueue.push(gated);
    }
  }

  return {
    profile,
    provider: ports.provider,
    sources: M1_SOURCES,
    snapshots: slice.snapshots,
    deltas,
    triages,
    published,
    reviewQueue,
    events: recorder.all(),
  };
}
