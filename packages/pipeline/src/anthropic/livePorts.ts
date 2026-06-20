/**
 * Live Anthropic implementations of the four model ports (DESIGN.md: Haiku for
 * classify/triage, Sonnet for synthesis/entailment). Each call forces structured
 * tool output and zod-validates it at the boundary — external model output is
 * untrusted input. Two safety rules are enforced HERE, not left to the model:
 *  - synthesis citation offsets are computed by `pinQuote`, never trusted from
 *    the model; a quote that is not a verbatim span is dropped;
 *  - entailment defaults to `false` for any claim the model fails to verdict,
 *    so a missing verdict blocks the publish rather than slipping through.
 *
 * `createModelPorts` (mocks) stays the default everywhere so `just ci` is offline
 * and deterministic; live ports are constructed only by the live eval entrypoint.
 */
import { z } from 'zod';
import type {
  Claim,
  EntailmentVerdict,
  RegTopic,
  SnapshotRecord,
  TopicAssignment,
} from '@regdelta/core';
import { NONE_STATED } from '@regdelta/core';
import type { ModelInvoker } from './invoker';
import { pinQuote, PinError } from '../pin';
import type {
  EntailmentInput,
  EntailmentVerifierPort,
  ModelPorts,
  SynthesisInput,
  SynthesisModelPort,
  SynthesisOutput,
  TopicClassifierInput,
  TopicClassifierOutput,
  TopicClassifierPort,
  TriageInput,
  TriageModelPort,
  TriageOutput,
} from '../ports';

export interface LiveModels {
  readonly cheap: string;
  readonly frontier: string;
}

export const DEFAULT_CHEAP_MODEL = 'claude-haiku-4-5-20251001';
export const DEFAULT_FRONTIER_MODEL = 'claude-sonnet-4-6';

export function resolveModels(env: Record<string, string | undefined> = {}): LiveModels {
  return {
    cheap: env['ANTHROPIC_MODEL_CHEAP'] ?? DEFAULT_CHEAP_MODEL,
    frontier: env['ANTHROPIC_MODEL_FRONTIER'] ?? DEFAULT_FRONTIER_MODEL,
  };
}

const confidence = z.number().min(0).max(1);

const topicResult = z.object({
  assignments: z.array(
    z.object({
      topicId: z.string().min(1),
      confidence,
      matchedKeywords: z.array(z.string()).default([]),
    }),
  ),
});

const triageResult = z.object({ confidence, rationale: z.string().min(1) });

const synthesisResult = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  requiredAction: z.string().min(1),
  affectedProducts: z.array(z.string().min(1)).default([]),
  effectiveDate: z.string().min(1),
  deadline: z.union([z.string().min(1), z.null()]).default(null),
  claims: z.array(z.object({ snapshotId: z.string().min(1), quote: z.string().min(1) })),
});

const entailmentResult = z.object({
  verdicts: z.array(
    z.object({ claimIndex: z.number().int().min(0), entailed: z.boolean(), rationale: z.string() }),
  ),
});

function liveTopicClassifier(invoker: ModelInvoker, model: string): TopicClassifierPort {
  return {
    label: `anthropic-topic-classifier:${model}`,
    async classify(input: TopicClassifierInput): Promise<TopicClassifierOutput> {
      const known = new Set(input.topics.map((topic) => topic.id));
      const raw = await invoker.invokeTool({
        model,
        maxTokens: 1024,
        system:
          'You classify regulatory change text into a FIXED topic taxonomy. Be recall-biased: ' +
          'assign every topic the text plausibly concerns. Only use the provided topic ids.',
        userText: JSON.stringify({
          topics: topicsForPrompt(input.topics),
          deltaText: input.deltaText,
        }),
        toolName: 'report_topics',
        toolDescription: 'Report which taxonomy topics this regulatory change concerns.',
        inputSchema: {
          type: 'object',
          required: ['assignments'],
          properties: {
            assignments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['topicId', 'confidence'],
                properties: {
                  topicId: { type: 'string' },
                  confidence: { type: 'number' },
                  matchedKeywords: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      });
      const parsed = topicResult.parse(raw);
      // Drop hallucinated topic ids — only taxonomy-defined topics are valid.
      const assignments: TopicAssignment[] = parsed.assignments
        .filter((assignment) => known.has(assignment.topicId))
        .map((assignment) => ({
          topicId: assignment.topicId,
          confidence: assignment.confidence,
          matchedKeywords: assignment.matchedKeywords,
        }));
      return { assignments };
    },
  };
}

function liveTriage(invoker: ModelInvoker, model: string): TriageModelPort {
  return {
    label: `anthropic-triage:${model}`,
    async assess(input: TriageInput): Promise<TriageOutput> {
      const raw = await invoker.invokeTool({
        model,
        maxTokens: 512,
        system:
          'You score how plausibly a regulatory change applies to a company profile. ' +
          'Be recall-biased: a missed applicable change is the fatal error. Return confidence 0..1.',
        userText: JSON.stringify({
          profile: {
            vertical: input.profile.vertical,
            products: input.profile.products,
            jurisdictions: input.profile.jurisdictions,
            licenseTypes: input.profile.licenseTypes,
            watchTerms: input.profile.watchTerms,
          },
          deltaText: input.deltaText,
        }),
        toolName: 'report_applicability',
        toolDescription: 'Report applicability confidence (0..1) and a short rationale.',
        inputSchema: {
          type: 'object',
          required: ['confidence', 'rationale'],
          properties: { confidence: { type: 'number' }, rationale: { type: 'string' } },
        },
      });
      return triageResult.parse(raw);
    },
  };
}

function liveSynthesis(invoker: ModelInvoker, model: string): SynthesisModelPort {
  return {
    label: `anthropic-synthesis:${model}`,
    async draft(input: SynthesisInput): Promise<SynthesisOutput> {
      const snapshots = new Map<string, SnapshotRecord>([
        [input.notice.snapshot.id, input.notice.snapshot],
      ]);
      if (input.amendment !== null) {
        snapshots.set(input.amendment.snapshot.id, input.amendment.snapshot);
      }
      const raw = await invoker.invokeTool({
        model,
        maxTokens: 2048,
        system:
          'Draft a compliance change card. Quote ONLY verbatim spans copied exactly from the ' +
          'provided snapshots. Use decision-support phrasing: never issue customer-directed ' +
          'imperatives (no "you must", "file", "submit"); include a "confirm applicability" hedge ' +
          'in requiredAction. effectiveDate is YYYY-MM-DD or "none_stated".',
        userText: JSON.stringify({
          profile: { products: input.profile.products, vertical: input.profile.vertical },
          snapshots: [...snapshots.values()].map((snapshot) => ({
            snapshotId: snapshot.id,
            text: snapshot.normalizedText,
          })),
        }),
        toolName: 'draft_change_card',
        toolDescription: 'Draft a citation-pinned change card with verbatim quotes.',
        inputSchema: {
          type: 'object',
          required: ['title', 'summary', 'requiredAction', 'effectiveDate', 'claims'],
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            requiredAction: { type: 'string' },
            affectedProducts: { type: 'array', items: { type: 'string' } },
            effectiveDate: { type: 'string' },
            deadline: { type: ['string', 'null'] },
            claims: {
              type: 'array',
              items: {
                type: 'object',
                required: ['snapshotId', 'quote'],
                properties: { snapshotId: { type: 'string' }, quote: { type: 'string' } },
              },
            },
          },
        },
      });
      const parsed = synthesisResult.parse(raw);
      // Pin offsets deterministically; silently drop any non-verbatim (fabricated)
      // quote — the gate is the authority, this just keeps valid claims.
      const claims: Claim[] = [];
      for (const claim of parsed.claims) {
        const snapshot = snapshots.get(claim.snapshotId);
        if (snapshot === undefined) {
          continue;
        }
        try {
          claims.push(pinQuote(snapshot, claim.quote));
        } catch (error: unknown) {
          if (!(error instanceof PinError)) {
            throw error;
          }
        }
      }
      return {
        title: parsed.title,
        summary: parsed.summary,
        requiredAction: parsed.requiredAction,
        affectedProducts: parsed.affectedProducts,
        effectiveDate: parsed.effectiveDate === NONE_STATED ? NONE_STATED : parsed.effectiveDate,
        deadline: parsed.deadline,
        claims,
      };
    },
  };
}

function liveEntailment(invoker: ModelInvoker, model: string): EntailmentVerifierPort {
  return {
    label: `anthropic-entailment:${model}`,
    async verify(input: EntailmentInput): Promise<EntailmentVerdict[]> {
      const raw = await invoker.invokeTool({
        model,
        maxTokens: 1024,
        system:
          'You are a STRICT entailment verifier. entailed=true ONLY if the quoted source text ' +
          'fully supports the claim. Default to false when uncertain. Return one verdict per claim.',
        userText: JSON.stringify({
          claims: input.claims.map((claim, claimIndex) => ({
            claimIndex,
            claim: claim.text,
            quote: claim.citation.quotedText,
          })),
        }),
        toolName: 'report_verdicts',
        toolDescription: 'Report an entailment verdict for every claim index.',
        inputSchema: {
          type: 'object',
          required: ['verdicts'],
          properties: {
            verdicts: {
              type: 'array',
              items: {
                type: 'object',
                required: ['claimIndex', 'entailed'],
                properties: {
                  claimIndex: { type: 'number' },
                  entailed: { type: 'boolean' },
                  rationale: { type: 'string' },
                },
              },
            },
          },
        },
      });
      const parsed = entailmentResult.parse(raw);
      const byIndex = new Map(parsed.verdicts.map((verdict) => [verdict.claimIndex, verdict]));
      // Skeptical default: any claim the model failed to verdict is treated as
      // not entailed, so a missing verdict blocks the publish (Invariant 2).
      return input.claims.map((_, claimIndex) => {
        const verdict = byIndex.get(claimIndex);
        return {
          claimIndex,
          entailed: verdict?.entailed ?? false,
          rationale: verdict?.rationale ?? 'no verdict returned for this claim — failing closed',
        };
      });
    },
  };
}

export function createLiveModelPorts(options: {
  readonly invoker: ModelInvoker;
  readonly models?: LiveModels;
}): ModelPorts {
  const models = options.models ?? resolveModels();
  return {
    topicClassifier: liveTopicClassifier(options.invoker, models.cheap),
    triage: liveTriage(options.invoker, models.cheap),
    synthesis: liveSynthesis(options.invoker, models.frontier),
    entailment: liveEntailment(options.invoker, models.frontier),
    provider: `anthropic (cheap=${models.cheap}, frontier=${models.frontier})`,
  };
}

function topicsForPrompt(
  topics: readonly RegTopic[],
): readonly { id: string; label: string; keywords: readonly string[] }[] {
  return topics.map((topic) => ({ id: topic.id, label: topic.label, keywords: topic.keywords }));
}
