/**
 * Decision-support language policy (Invariant 6): customer-facing card copy
 * must never state legal conclusions. The gate blocks these phrases.
 */
export const FORBIDDEN_CONCLUSION_PHRASES: readonly string[] = [
  'you must',
  'you are required',
  'you are obligated',
  'you have to',
  'this applies to you',
];

export function findForbiddenPhrases(text: string): string[] {
  const lowered = text.toLowerCase();
  return FORBIDDEN_CONCLUSION_PHRASES.filter((phrase) => lowered.includes(phrase));
}
