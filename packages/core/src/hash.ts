import { createHash } from 'node:crypto';
import type { JsonValue } from './types';

/** SHA-256 hex digest of a UTF-8 string. Used for content hashes and the event chain. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Deterministic JSON serialization: object keys sorted recursively.
 * Required so event hashes are stable regardless of property insertion order.
 */
export function canonicalStringify(value: JsonValue): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`canonicalStringify: non-finite number ${String(value)}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key] as JsonValue)}`);
  return `{${entries.join(',')}}`;
}
