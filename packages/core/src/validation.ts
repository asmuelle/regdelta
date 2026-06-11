import { z } from 'zod';
import { isValidIsoDate } from './dates';
import { NONE_STATED, type ChangeCardDraft } from './types';

const SHA256_HEX = /^[0-9a-f]{64}$/;

const citationSchema = z
  .object({
    snapshotId: z.string().min(1),
    sourceUrl: z.string().url(),
    snapshotContentHash: z.string().regex(SHA256_HEX, 'must be a sha256 hex digest'),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().positive(),
    quotedText: z.string().min(1),
  })
  .refine((c) => c.charEnd > c.charStart, { message: 'charEnd must be greater than charStart' });

const claimSchema = z.object({
  text: z.string().min(1),
  citation: citationSchema,
});

const diffOpSchema = z.object({
  kind: z.enum(['equal', 'insert', 'delete']),
  text: z.string(),
});

const isoDate = z.string().refine(isValidIsoDate, { message: 'must be a valid ISO date' });

/**
 * Invariant 1: a provenance-free publish is unrepresentable. Every card must
 * carry at least one pinned citation (snapshot id + offsets + hash + URL) and
 * an effective date or the explicit `none_stated` marker.
 */
export const changeCardDraftSchema = z.object({
  id: z.string().min(1),
  deltaId: z.string().min(1),
  companyId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  requiredAction: z.string().min(1),
  affectedProducts: z.array(z.string().min(1)).min(1),
  effectiveDate: z.union([z.literal(NONE_STATED), isoDate]),
  deadline: z.union([z.null(), isoDate]),
  materiality: z.enum(['high', 'normal']),
  redline: z.array(diffOpSchema),
  claims: z.array(claimSchema).min(1),
});

export type CardValidation = { valid: true } | { valid: false; issues: string[] };

export function validateChangeCardDraft(card: ChangeCardDraft): CardValidation {
  const result = changeCardDraftSchema.safeParse(card);
  if (result.success) {
    return { valid: true };
  }
  const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  return { valid: false, issues };
}
