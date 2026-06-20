/**
 * Billing & entitlements (DESIGN.md M3: Multi-state $599, Firm tier; no $199; the
 * free exposure scan is the land motion). Pure domain logic: plan → entitlements,
 * Stripe price → tier, and webhook signature verification (HMAC, like reviewer
 * auth). Creating checkout sessions hits the Stripe API and is the only part
 * gated on STRIPE_SECRET_KEY; everything here is unit-tested offline.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type PlanTier = 'free_scan' | 'multi_state' | 'firm';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Entitlements {
  /** Examiner PDF/CSV export — gated to paid (the trust artifact buyers pay for). */
  readonly auditExport: boolean;
  readonly versionHistory: boolean;
  readonly slackAlerts: boolean;
  readonly maxJurisdictions: number;
  /** Firm tier: multi-client profiles + white-label digests. */
  readonly multiClient: boolean;
}

const FREE_SCAN: Entitlements = {
  auditExport: false,
  versionHistory: false,
  slackAlerts: false,
  maxJurisdictions: 10,
  multiClient: false,
};

const ENTITLEMENTS: Record<PlanTier, Entitlements> = {
  free_scan: FREE_SCAN,
  multi_state: {
    auditExport: true,
    versionHistory: true,
    slackAlerts: true,
    maxJurisdictions: 10,
    multiClient: false,
  },
  firm: {
    auditExport: true,
    versionHistory: true,
    slackAlerts: true,
    maxJurisdictions: 50,
    multiClient: true,
  },
};

export function entitlementsFor(tier: PlanTier): Entitlements {
  return ENTITLEMENTS[tier];
}

export interface Subscription {
  readonly companyId: string;
  readonly tier: PlanTier;
  readonly status: SubscriptionStatus;
  readonly currentPeriodEnd: string | null;
}

/** Entitlements actually in force: only an active/trialing subscription grants its tier. */
export function activeEntitlements(subscription: Subscription | null): Entitlements {
  if (
    subscription === null ||
    (subscription.status !== 'active' && subscription.status !== 'trialing')
  ) {
    return FREE_SCAN;
  }
  return entitlementsFor(subscription.tier);
}

export function isEntitled(
  subscription: Subscription | null,
  feature: 'auditExport' | 'versionHistory' | 'slackAlerts' | 'multiClient',
): boolean {
  return activeEntitlements(subscription)[feature];
}

/** Map a Stripe price id to a plan tier via a configured mapping; unknown → null. */
export function tierForPriceId(
  priceId: string,
  mapping: Readonly<Record<string, PlanTier>>,
): PlanTier | null {
  return mapping[priceId] ?? null;
}

const STRIPE_TOLERANCE_SECONDS = 300;

/**
 * Verify a Stripe webhook signature (`t=<ts>,v1=<hmac>`): HMAC-SHA256 of
 * `${t}.${payload}` under the signing secret, constant-time compared, with the
 * timestamp inside the tolerance window. `nowEpochSec` is injected for testability.
 */
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowEpochSec: number,
  toleranceSeconds: number = STRIPE_TOLERANCE_SECONDS,
): boolean {
  if (secret.length === 0) {
    return false;
  }
  const parts = new Map(
    signatureHeader.split(',').map((kv) => {
      const eq = kv.indexOf('=');
      return [kv.slice(0, eq), kv.slice(eq + 1)] as const;
    }),
  );
  const timestamp = parts.get('t');
  const provided = parts.get('v1');
  if (timestamp === undefined || provided === undefined) {
    return false;
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowEpochSec - ts) > toleranceSeconds) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
