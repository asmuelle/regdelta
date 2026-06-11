import { canonicalStringify, sha256Hex } from './hash';
import type { ActorType, EventRecord, JsonValue } from './types';

export interface EventInput {
  readonly actorType: ActorType;
  readonly actorId: string;
  readonly eventType: string;
  readonly payload: JsonValue;
}

/** Hash over every field except `eventHash` itself, via canonical JSON. */
export function computeEventHash(event: Omit<EventRecord, 'eventHash'>): string {
  return sha256Hex(
    canonicalStringify({
      seq: event.seq,
      actorType: event.actorType,
      actorId: event.actorId,
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: event.occurredAt,
      prevEventHash: event.prevEventHash,
    }),
  );
}

/**
 * Append-only event log (Invariant 4): returns a NEW array, never mutates the
 * input. Each event chains to its predecessor via `prevEventHash`.
 */
export function appendEvent(
  log: readonly EventRecord[],
  input: EventInput,
  occurredAt: string,
): EventRecord[] {
  const prev = log.length > 0 ? log[log.length - 1] : undefined;
  const seq = prev !== undefined ? prev.seq + 1 : 1;
  const prevEventHash = prev !== undefined ? prev.eventHash : null;
  const unhashed = {
    seq,
    actorType: input.actorType,
    actorId: input.actorId,
    eventType: input.eventType,
    payload: input.payload,
    occurredAt,
    prevEventHash,
  };
  return [...log, { ...unhashed, eventHash: computeEventHash(unhashed) }];
}

export interface ChainVerification {
  readonly valid: boolean;
  readonly brokenAtSeq: number | null;
}

/** Verify the hash chain end-to-end: sequence continuity, links, and recomputed hashes. */
export function verifyEventChain(log: readonly EventRecord[]): ChainVerification {
  let prevHash: string | null = null;
  let expectedSeq = 1;
  for (const event of log) {
    const recomputed = computeEventHash({
      seq: event.seq,
      actorType: event.actorType,
      actorId: event.actorId,
      eventType: event.eventType,
      payload: event.payload,
      occurredAt: event.occurredAt,
      prevEventHash: event.prevEventHash,
    });
    if (
      event.seq !== expectedSeq ||
      event.prevEventHash !== prevHash ||
      recomputed !== event.eventHash
    ) {
      return { valid: false, brokenAtSeq: event.seq };
    }
    prevHash = event.eventHash;
    expectedSeq = event.seq + 1;
  }
  return { valid: true, brokenAtSeq: null };
}
