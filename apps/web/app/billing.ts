import { entitlementsFor, type Entitlements, type PlanTier } from '@regdelta/core';

const TIERS: readonly PlanTier[] = ['free_scan', 'multi_state', 'firm'];

function isTier(value: string): value is PlanTier {
  return (TIERS as readonly string[]).includes(value);
}

/**
 * Entitlements in force for this deployment. `REGDELTA_PLAN_TIER` overrides for
 * demos (e.g. `free_scan` to see export gating); with nothing configured the demo
 * is permissive (Firm) so the no-billing build stays fully usable. Real billing
 * resolves the tier from the company's Stripe subscription (gated on Stripe keys).
 */
export function currentEntitlements(): Entitlements {
  const plan = process.env['REGDELTA_PLAN_TIER'];
  return entitlementsFor(plan !== undefined && isTier(plan) ? plan : 'firm');
}
