import { cookies } from 'next/headers';
import {
  authenticateReviewer,
  signSession,
  verifySession,
  type ReviewerSession,
} from '@regdelta/core';

const COOKIE = 'regdelta_session';

interface AuthEnv {
  readonly secret: string;
  readonly allowlist: readonly string[];
  readonly accessCode: string;
}

function authEnv(): AuthEnv {
  return {
    secret: process.env['REGDELTA_SESSION_SECRET'] ?? '',
    allowlist: (process.env['REGDELTA_REVIEWERS'] ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
    accessCode: process.env['REGDELTA_ACCESS_CODE'] ?? '',
  };
}

/** Auth is enforced only when a session secret is configured. */
export function authConfigured(): boolean {
  return authEnv().secret.length > 0;
}

/** The signed-in reviewer from the session cookie, or null. */
export async function currentReviewer(): Promise<ReviewerSession | null> {
  const { secret } = authEnv();
  if (secret.length === 0) {
    return null;
  }
  const token = (await cookies()).get(COOKIE)?.value;
  return token === undefined ? null : verifySession(token, secret);
}

/** Validate credentials and set the session cookie. Returns false on bad credentials. */
export async function signInReviewer(email: string, code: string, now: string): Promise<boolean> {
  const env = authEnv();
  const session = authenticateReviewer(
    email,
    code,
    { allowlist: env.allowlist, accessCode: env.accessCode },
    now,
  );
  if (session === null) {
    return false;
  }
  (await cookies()).set(COOKIE, signSession(session, env.secret), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return true;
}

/**
 * The actor id to attribute a decision to. With auth configured, requires a valid
 * session (null → the action must refuse). Without auth configured, a clearly
 * labelled demo identity so the in-database demo stays interactive.
 */
export async function effectiveReviewerId(): Promise<string | null> {
  if (!authConfigured()) {
    return 'unauthenticated-reviewer';
  }
  return (await currentReviewer())?.email ?? null;
}
