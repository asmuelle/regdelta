import { describe, expect, it } from 'vitest';
import { InvariantViolationError } from '@regdelta/core';
import {
  AdapterError,
  fetchEcfrSection,
  fetchFederalRegisterCfpb,
  snapshotFromFetch,
} from './ingest';
import {
  M1_SOURCES,
  ecfrTitle12Section102640Source,
  federalRegisterCfpbSource,
  registerSources,
} from './sources';

describe('registerSources', () => {
  it('registers the M1 sources, each with a recorded tosBasis', () => {
    // Act
    const registry = registerSources(M1_SOURCES);

    // Assert
    expect(registry.size).toBe(2);
    for (const source of registry.values()) {
      expect(source.tosBasis.length).toBeGreaterThan(0);
    }
  });

  it('rejects a source without a tosBasis (Invariant 8)', () => {
    // Arrange
    const withoutBasis = { ...federalRegisterCfpbSource, id: 'src-bad', tosBasis: '   ' };

    // Act + Assert
    expect(() => registerSources([withoutBasis])).toThrow(InvariantViolationError);
    expect(() => registerSources([withoutBasis])).toThrow(/tosBasis/);
  });

  it('rejects duplicate source ids', () => {
    expect(() => registerSources([federalRegisterCfpbSource, federalRegisterCfpbSource])).toThrow(
      /registered twice/,
    );
  });
});

describe('fixture adapters', () => {
  it('replays the recorded Federal Register document offline', () => {
    // Act
    const fetched = fetchFederalRegisterCfpb(federalRegisterCfpbSource);

    // Assert
    expect(fetched.rawText).toContain('Regulation Z');
    expect(fetched.url).toMatch(/^https:\/\/www\.federalregister\.gov\//);
  });

  it('replays prior and current eCFR snapshots with differing content', () => {
    // Act
    const prior = fetchEcfrSection(ecfrTitle12Section102640Source, 'prior');
    const current = fetchEcfrSection(ecfrTitle12Section102640Source, 'current');

    // Assert
    expect(prior.rawText).not.toBe(current.rawText);
    expect(current.rawText).toContain('three business days');
  });

  it('throws an AdapterError when a source is bound to the wrong adapter', () => {
    expect(() => fetchFederalRegisterCfpb(ecfrTitle12Section102640Source)).toThrow(AdapterError);
    expect(() => fetchEcfrSection(federalRegisterCfpbSource, 'prior')).toThrow(AdapterError);
  });

  it('content-hashes the normalized text into an immutable snapshot', () => {
    // Arrange
    const fetched = fetchFederalRegisterCfpb(federalRegisterCfpbSource);

    // Act
    const a = snapshotFromFetch(fetched, 'snap-a');
    const b = snapshotFromFetch(fetched, 'snap-b');

    // Assert — same content, same hash; hash is over normalized text.
    expect(a.contentHash).toBe(b.contentHash);
    expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.normalizedText).not.toContain('\r\n');
  });
});
