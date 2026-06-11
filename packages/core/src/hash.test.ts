import { describe, expect, it } from 'vitest';
import { canonicalStringify, sha256Hex } from './hash';

describe('sha256Hex', () => {
  it('produces the known digest for a fixed input', () => {
    // Arrange
    const input = 'regdelta';

    // Act
    const digest = sha256Hex(input);

    // Assert
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(sha256Hex('regdelta'));
    expect(digest).not.toBe(sha256Hex('regdelta '));
  });
});

describe('canonicalStringify', () => {
  it('serializes objects with sorted keys regardless of insertion order', () => {
    // Arrange
    const a = { zulu: 1, alpha: { nested: true, aardvark: 'x' } };
    const b = { alpha: { aardvark: 'x', nested: true }, zulu: 1 };

    // Act & Assert
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(canonicalStringify(a)).toBe('{"alpha":{"aardvark":"x","nested":true},"zulu":1}');
  });

  it('throws on non-finite numbers instead of silently corrupting the hash input', () => {
    expect(() => canonicalStringify(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});
