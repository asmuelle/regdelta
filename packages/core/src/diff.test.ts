import { describe, expect, it } from 'vitest';
import { diffTexts, hasChanges, insertedSegments, segmentText } from './diff';
import { normalizeText } from './normalize';

const PRIOR = normalizeText(
  '(b) Time of disclosures. The disclosures shall be provided at the time an application is provided to the consumer.\n\n(c) Duties of third parties. Persons other than the creditor must provide the brochure.',
);

const CURRENT = normalizeText(
  '(b) Time of disclosures. The disclosures shall be delivered not later than three business days after the creditor receives the application.\n\n(c) Duties of third parties. Persons other than the creditor must provide the brochure.',
);

describe('segmentText', () => {
  it('splits on paragraph breaks and sentence boundaries without splitting section numbers', () => {
    // Arrange
    const text = normalizeText(
      '§ 1026.40 Requirements for home equity plans.\n\n(b) Time. The rule under 15 U.S.C. 1604 applies.',
    );

    // Act
    const segments = segmentText(text);

    // Assert
    expect(segments).toEqual([
      '§ 1026.40 Requirements for home equity plans.',
      '(b) Time.',
      'The rule under 15 U.S.C. 1604 applies.',
    ]);
  });

  it('returns segments that are exact substrings of the normalized input', () => {
    for (const segment of segmentText(CURRENT)) {
      expect(CURRENT.includes(segment)).toBe(true);
    }
  });
});

describe('diffTexts', () => {
  it('marks the amended sentence as delete+insert and leaves untouched text equal', () => {
    // Act
    const ops = diffTexts(PRIOR, CURRENT);

    // Assert
    expect(ops.filter((op) => op.kind === 'delete')).toHaveLength(1);
    expect(ops.filter((op) => op.kind === 'insert')).toHaveLength(1);
    expect(insertedSegments(ops)[0]).toContain('three business days');
    expect(hasChanges(ops)).toBe(true);
  });

  it('is deterministic: identical input pairs produce identical ops every run', () => {
    // Act
    const first = diffTexts(PRIOR, CURRENT);
    const second = diffTexts(PRIOR, CURRENT);

    // Assert
    expect(second).toStrictEqual(first);
  });

  it('produces only equal ops for identical texts', () => {
    const ops = diffTexts(PRIOR, PRIOR);
    expect(ops.every((op) => op.kind === 'equal')).toBe(true);
    expect(hasChanges(ops)).toBe(false);
  });
});
