/**
 * Hand-labeled materiality corpus (DESIGN.md M2). Includes omission traps: cases
 * that must NOT be missed (recall) and cases that must NOT be over-flagged
 * (precision). Grow this corpus with a compliance SME as coverage widens — the
 * eval's quality ceiling is the labeler's. Labeling clock is fixed at 2026-06-10.
 */
import type { MaterialityCase } from './materialityEval';

const NOW = '2026-06-10';

export const MATERIALITY_CORPUS: readonly MaterialityCase[] = [
  {
    id: 'high-near-effective-date',
    input: { effectiveDate: '2026-06-25', now: NOW, text: 'routine amendment' },
    expected: 'high',
    note: 'effective in 15 days — inside the action window',
  },
  {
    id: 'high-boundary-30-days',
    input: { effectiveDate: '2026-07-10', now: NOW, text: 'routine amendment' },
    expected: 'high',
    note: 'exactly 30 days out — boundary must score high',
  },
  {
    id: 'high-effective-immediately',
    input: { effectiveDate: 'none_stated', now: NOW, text: 'The order is effective immediately.' },
    expected: 'high',
    note: 'no date but immediate effect — enforcement signal',
  },
  {
    id: 'high-civil-money-penalty',
    input: {
      effectiveDate: 'none_stated',
      now: NOW,
      text: 'The Bureau assessed a civil money penalty against the respondent.',
    },
    expected: 'high',
    note: 'penalty language — high regardless of date',
  },
  {
    id: 'high-cease-and-desist',
    input: { effectiveDate: 'none_stated', now: NOW, text: 'A cease and desist order was issued.' },
    expected: 'high',
    note: 'cease and desist — enforcement signal',
  },
  {
    id: 'high-enforcement-action',
    input: {
      effectiveDate: '2026-12-01',
      now: NOW,
      text: 'This enforcement action resolves the matter.',
    },
    expected: 'high',
    note: 'enforcement action overrides a distant date',
  },
  {
    id: 'normal-distant-effective-date',
    input: { effectiveDate: '2026-10-08', now: NOW, text: 'Reg Z disclosure timing amendment.' },
    expected: 'normal',
    note: '120 days out — not yet in the action window',
  },
  {
    id: 'normal-boundary-31-days',
    input: { effectiveDate: '2026-07-11', now: NOW, text: 'routine amendment' },
    expected: 'normal',
    note: '31 days out — just outside the window, must not over-flag',
  },
  {
    id: 'normal-none-stated-routine',
    input: { effectiveDate: 'none_stated', now: NOW, text: 'Technical correction to a footnote.' },
    expected: 'normal',
    note: 'no date, routine text — must not over-flag',
  },
  {
    id: 'normal-comment-deadline-only',
    input: {
      effectiveDate: 'none_stated',
      now: NOW,
      text: 'Comments on the proposed rule are due August 1, 2026.',
    },
    expected: 'normal',
    note: 'comment deadline is not an effective date — trap for over-flagging',
  },
  {
    id: 'normal-already-effective',
    input: { effectiveDate: '2026-06-05', now: NOW, text: 'routine amendment' },
    expected: 'normal',
    note: 'already effective (past date) — not an upcoming action',
  },
  {
    id: 'normal-mid-window-routine',
    input: { effectiveDate: '2026-07-25', now: NOW, text: 'routine amendment' },
    expected: 'normal',
    note: '45 days out — outside the window',
  },
];
