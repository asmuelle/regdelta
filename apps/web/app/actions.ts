'use server';

import { revalidatePath } from 'next/cache';
import { createDbClient, recordReviewDecision } from '@regdelta/db';
import { effectiveReviewerId, signInReviewer } from './auth';

/** Sign a reviewer in (allowlist + access code). No-op on bad credentials. */
export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const code = String(formData.get('code') ?? '');
  if (email !== '' && code !== '') {
    await signInReviewer(email, code, new Date().toISOString());
  }
  revalidatePath('/');
}

/**
 * Record a reviewer's approve/reject as a hash-chained human_decision event
 * (Invariants 4/6). Attributed to the authenticated reviewer; if auth is
 * configured and no valid session exists, the action refuses (no decision is
 * recorded without an attributable human). No-ops without a database.
 */
export async function submitDecision(formData: FormData): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return;
  }
  const actorId = await effectiveReviewerId();
  if (actorId === null) {
    return; // unauthenticated — no attributable human, no decision
  }
  const cardId = String(formData.get('cardId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  if (cardId === '' || (kind !== 'approve_card' && kind !== 'reject_card')) {
    return;
  }

  const client = createDbClient(databaseUrl, { max: 1 });
  try {
    await recordReviewDecision(client, {
      actorId,
      kind,
      subjectId: cardId,
      reason: kind === 'approve_card' ? 'approved in review queue' : 'rejected in review queue',
      occurredAt: new Date().toISOString(),
    });
  } finally {
    await client.close();
  }
  revalidatePath('/');
}
