import type { DiffOp } from './types';

const PARAGRAPH_BREAK = /\n{2,}/;
// Split after sentence punctuation when the next segment starts like a sentence
// (capital letter, section sign, or enumerator paren). Digits after a period
// (e.g. "1026.40") never split.
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+(?=[A-Z§(])/;

/**
 * Deterministic segmentation of normalized text into sentence-level units.
 * Every returned segment is an exact substring of the input (only edge-trimmed),
 * which citation pinning relies on.
 */
export function segmentText(text: string): string[] {
  return text
    .split(PARAGRAPH_BREAK)
    .flatMap((paragraph) => paragraph.split(SENTENCE_BOUNDARY))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/**
 * Structural diff over sentence segments via longest-common-subsequence.
 * Pure and deterministic: identical inputs always yield identical ops
 * (Invariant 3 — change detection never involves a model).
 */
export function diffSegments(prior: readonly string[], current: readonly string[]): DiffOp[] {
  const table = buildLcsTable(prior, current);
  return backtrack(table, prior, current);
}

export function diffTexts(priorText: string, currentText: string): DiffOp[] {
  return diffSegments(segmentText(priorText), segmentText(currentText));
}

export function hasChanges(ops: readonly DiffOp[]): boolean {
  return ops.some((op) => op.kind !== 'equal');
}

export function insertedSegments(ops: readonly DiffOp[]): string[] {
  return ops.filter((op) => op.kind === 'insert').map((op) => op.text);
}

function buildLcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      // Bounds are guaranteed by the loop ranges.
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

function backtrack(table: number[][], a: readonly string[], b: readonly string[]): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', text: a[i]! });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      // Tie-break: deletions before insertions, deterministically.
      ops.push({ kind: 'delete', text: a[i]! });
      i += 1;
    } else {
      ops.push({ kind: 'insert', text: b[j]! });
      j += 1;
    }
  }
  while (i < a.length) {
    ops.push({ kind: 'delete', text: a[i]! });
    i += 1;
  }
  while (j < b.length) {
    ops.push({ kind: 'insert', text: b[j]! });
    j += 1;
  }
  return ops;
}
