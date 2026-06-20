import { describe, expect, it } from 'vitest';
import { appendEvent, verifyEventChain } from './events';
import type { EventRecord } from './types';

function buildLog(): EventRecord[] {
  let log: EventRecord[] = [];
  log = appendEvent(
    log,
    {
      actorType: 'system',
      actorId: 'crawler',
      eventType: 'source_crawled',
      payload: { sourceId: 's1' },
    },
    '2026-06-10T06:00:00.000Z',
  );
  log = appendEvent(
    log,
    {
      actorType: 'system',
      actorId: 'differ',
      eventType: 'delta_detected',
      payload: { deltaId: 'd1' },
    },
    '2026-06-10T06:00:01.000Z',
  );
  log = appendEvent(
    log,
    {
      actorType: 'model',
      actorId: 'triage-mock',
      eventType: 'triage_completed',
      payload: { confidence: 0.8 },
    },
    '2026-06-10T06:00:02.000Z',
  );
  return log;
}

describe('appendEvent', () => {
  it('builds a hash chain where each event links to its predecessor', () => {
    // Act
    const log = buildLog();

    // Assert
    expect(log[0]!.prevEventHash).toBeNull();
    expect(log[1]!.prevEventHash).toBe(log[0]!.eventHash);
    expect(log[2]!.prevEventHash).toBe(log[1]!.eventHash);
    expect(log.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('never mutates the input log (append-only, immutable)', () => {
    // Arrange
    const original = buildLog();
    const lengthBefore = original.length;

    // Act
    const extended = appendEvent(
      original,
      {
        actorType: 'human',
        actorId: 'reviewer@example.com',
        eventType: 'human_decision',
        payload: {},
      },
      '2026-06-10T06:00:03.000Z',
    );

    // Assert
    expect(original).toHaveLength(lengthBefore);
    expect(extended).toHaveLength(lengthBefore + 1);
    expect(extended).not.toBe(original);
  });

  it('is deterministic: same inputs produce identical hashes', () => {
    expect(buildLog()).toStrictEqual(buildLog());
  });
});

describe('verifyEventChain', () => {
  it('verifies an untampered chain end-to-end', () => {
    expect(verifyEventChain(buildLog())).toEqual({ valid: true, brokenAtSeq: null });
  });

  it('detects payload tampering', () => {
    // Arrange
    const log = buildLog();
    const tampered = log.map((event) =>
      event.seq === 2 ? { ...event, payload: { deltaId: 'FORGED' } } : event,
    );

    // Act
    const result = verifyEventChain(tampered);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });

  it('detects a removed (gapped) event', () => {
    const log = buildLog();
    const gapped = [log[0]!, log[2]!];
    expect(verifyEventChain(gapped).valid).toBe(false);
  });

  it('accepts the empty log', () => {
    expect(verifyEventChain([]).valid).toBe(true);
  });
});
