import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  activeEntitlements,
  entitlementsFor,
  isEntitled,
  tierForPriceId,
  verifyStripeSignature,
  type Subscription,
} from './billing';

describe('entitlements', () => {
  it('gates audit export + history behind paid tiers; free scan gets neither', () => {
    expect(entitlementsFor('free_scan').auditExport).toBe(false);
    expect(entitlementsFor('multi_state').auditExport).toBe(true);
    expect(entitlementsFor('firm').multiClient).toBe(true);
    expect(entitlementsFor('multi_state').multiClient).toBe(false);
  });

  it('only an active/trialing subscription grants its tier', () => {
    const base: Subscription = {
      companyId: 'co-1',
      tier: 'multi_state',
      status: 'active',
      currentPeriodEnd: '2026-07-01',
    };
    expect(isEntitled(base, 'auditExport')).toBe(true);
    expect(isEntitled({ ...base, status: 'past_due' }, 'auditExport')).toBe(false);
    expect(isEntitled({ ...base, status: 'canceled' }, 'auditExport')).toBe(false);
    expect(isEntitled(null, 'auditExport')).toBe(false);
    expect(activeEntitlements({ ...base, status: 'trialing' }).auditExport).toBe(true);
  });
});

describe('tierForPriceId', () => {
  it('maps configured price ids and rejects unknown ones', () => {
    const mapping = { price_ms: 'multi_state', price_firm: 'firm' } as const;
    expect(tierForPriceId('price_ms', mapping)).toBe('multi_state');
    expect(tierForPriceId('price_unknown', mapping)).toBeNull();
  });
});

describe('verifyStripeSignature', () => {
  const SECRET = 'whsec_test';
  const PAYLOAD = '{"type":"customer.subscription.updated"}';
  const NOW = 1_750_000_000;

  function header(ts: number, payload: string, secret: string): string {
    const sig = createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
    return `t=${ts},v1=${sig}`;
  }

  it('accepts a valid, in-window signature', () => {
    expect(verifyStripeSignature(PAYLOAD, header(NOW, PAYLOAD, SECRET), SECRET, NOW)).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const h = header(NOW, PAYLOAD, SECRET);
    expect(verifyStripeSignature('{"type":"evil"}', h, SECRET, NOW)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(verifyStripeSignature(PAYLOAD, header(NOW, PAYLOAD, SECRET), 'whsec_other', NOW)).toBe(
      false,
    );
  });

  it('rejects a timestamp outside the tolerance window', () => {
    const stale = header(NOW - 10_000, PAYLOAD, SECRET);
    expect(verifyStripeSignature(PAYLOAD, stale, SECRET, NOW)).toBe(false);
  });

  it('rejects malformed headers and empty secret', () => {
    expect(verifyStripeSignature(PAYLOAD, 'garbage', SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, header(NOW, PAYLOAD, SECRET), '', NOW)).toBe(false);
  });
});
