import { describe, expect, it } from 'vitest';
import { authenticateReviewer, signSession, verifySession } from './auth';

const SECRET = 'test-session-secret';
const CONFIG = { allowlist: ['alice@meridian.example'], accessCode: 'let-me-in' };
const NOW = '2026-06-20T09:00:00.000Z';

describe('signSession / verifySession', () => {
  it('round-trips a session and verifies it', () => {
    const token = signSession({ email: 'alice@meridian.example', issuedAt: NOW }, SECRET);
    expect(verifySession(token, SECRET)).toEqual({
      email: 'alice@meridian.example',
      issuedAt: NOW,
    });
  });

  it('rejects a tampered payload', () => {
    const token = signSession({ email: 'alice@meridian.example', issuedAt: NOW }, SECRET);
    const tampered = `${Buffer.from('{"email":"mallory@evil.example","issuedAt":"' + NOW + '"}', 'utf8').toString('base64url')}.${token.slice(token.indexOf('.') + 1)}`;
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession({ email: 'alice@meridian.example', issuedAt: NOW }, SECRET);
    expect(verifySession(token, 'other-secret')).toBeNull();
  });

  it('rejects malformed tokens and empty secrets', () => {
    expect(verifySession('not-a-token', SECRET)).toBeNull();
    expect(verifySession('a.b', SECRET)).toBeNull();
    const token = signSession({ email: 'a@b.com', issuedAt: NOW }, SECRET);
    expect(verifySession(token, '')).toBeNull();
  });
});

describe('authenticateReviewer', () => {
  it('authenticates an allowlisted reviewer with the right code (email normalized)', () => {
    const session = authenticateReviewer('  Alice@Meridian.Example ', 'let-me-in', CONFIG, NOW);
    expect(session).toEqual({ email: 'alice@meridian.example', issuedAt: NOW });
  });

  it('rejects an unknown reviewer', () => {
    expect(authenticateReviewer('bob@elsewhere.example', 'let-me-in', CONFIG, NOW)).toBeNull();
  });

  it('rejects a wrong access code', () => {
    expect(authenticateReviewer('alice@meridian.example', 'wrong', CONFIG, NOW)).toBeNull();
  });

  it('authenticates no one when the access code is unset', () => {
    expect(
      authenticateReviewer('alice@meridian.example', '', { ...CONFIG, accessCode: '' }, NOW),
    ).toBeNull();
  });
});
