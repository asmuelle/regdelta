/**
 * Reviewer authentication (Invariant 6: decisions carry an attributable human
 * identity). Pure crypto over node:crypto — an HMAC-signed session token plus an
 * allowlist + access-code check. Not full SSO; it makes the decision actor a real,
 * verifiable reviewer rather than a placeholder, and the web layer enforces it.
 * All functions take an explicit clock value, so they stay deterministically testable.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ReviewerSession {
  readonly email: string;
  readonly issuedAt: string;
}

export interface ReviewerAuthConfig {
  /** Lowercased reviewer emails permitted to sign in. */
  readonly allowlist: readonly string[];
  /** Shared access code; an empty code authenticates no one. */
  readonly accessCode: string;
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function hmac(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

/** Constant-time string compare that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** Sign a session as `base64url(payload).hmac`. */
export function signSession(session: ReviewerSession, secret: string): string {
  if (secret.length === 0) {
    throw new Error('signSession: secret is empty');
  }
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${hmac(payload, secret)}`;
}

/** Verify and decode a session token; returns null on any tampering or malformed input. */
export function verifySession(token: string, secret: string): ReviewerSession | null {
  if (secret.length === 0) {
    return null;
  }
  const dot = token.indexOf('.');
  if (dot <= 0) {
    return null;
  }
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(mac, hmac(payload, secret))) {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      decoded === null ||
      typeof decoded !== 'object' ||
      typeof (decoded as { email?: unknown }).email !== 'string' ||
      typeof (decoded as { issuedAt?: unknown }).issuedAt !== 'string'
    ) {
      return null;
    }
    const session = decoded as ReviewerSession;
    return { email: session.email, issuedAt: session.issuedAt };
  } catch {
    return null;
  }
}

/** Authenticate a reviewer against the allowlist + access code; null when invalid. */
export function authenticateReviewer(
  email: string,
  code: string,
  config: ReviewerAuthConfig,
  now: string,
): ReviewerSession | null {
  const normalized = email.trim().toLowerCase();
  if (config.accessCode.length === 0 || !config.allowlist.includes(normalized)) {
    return null;
  }
  if (!safeEqual(code, config.accessCode)) {
    return null;
  }
  return { email: normalized, issuedAt: now };
}
