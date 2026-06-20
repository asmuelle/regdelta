/**
 * Required-action advisory policy (DESIGN.md Risk; Invariant 6).
 *
 * `requiredAction` is the one generative card field the entailment gate CANNOT
 * verify — entailment checks that a quote supports a claim, but "what you must
 * do" is interpretation, the field most likely to be wrong and the closest thing
 * to legal advice. Policy: an auto-publishable action must be ADVISORY — it must
 * carry a confirm-applicability hedge and must NOT issue a customer-directed
 * imperative. Anything directive is routed to the human review queue by the gate.
 */

/** Customer-directed imperatives — their presence forces human review. */
export const DIRECTIVE_PATTERNS: readonly RegExp[] = [
  /\byou must\b/i,
  /\byou should\b/i,
  /\byou need to\b/i,
  /\byou are required\b/i,
  /\byou have to\b/i,
  /\bfile\b/i,
  /\bsubmit\b/i,
  /\bregister\b/i,
  /\bremit\b/i,
  /\bpay\b/i,
  /\bimplement\b/i,
  /\badopt\b/i,
  /\bcease\b/i,
  /\bterminate\b/i,
  /\bcomply by\b/i,
];

/** Advisory framing that must be present for an action to auto-publish. */
export const ADVISORY_HEDGES: readonly string[] = [
  'confirm applicability',
  'decision support',
  'review the',
  'assess whether',
];

export interface ActionAdvisoryResult {
  readonly isAdvisory: boolean;
  readonly directiveTerms: readonly string[];
  readonly hasHedge: boolean;
}

/**
 * Classify a `requiredAction`. Advisory iff it carries a hedge AND issues no
 * directive imperative. Deterministic; the gate consumes this verdict.
 */
export function classifyRequiredAction(text: string): ActionAdvisoryResult {
  const lowered = text.toLowerCase();
  const directiveTerms = DIRECTIVE_PATTERNS.filter((pattern) => pattern.test(text)).map((pattern) =>
    pattern.source.replace(/\\b/g, '').replace(/\\/g, ''),
  );
  const hasHedge = ADVISORY_HEDGES.some((hedge) => lowered.includes(hedge));
  return {
    isAdvisory: hasHedge && directiveTerms.length === 0,
    directiveTerms,
    hasHedge,
  };
}
