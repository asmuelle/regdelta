'use server';

import { revalidatePath } from 'next/cache';
import { createDbClient, recordReviewDecision } from '@regdelta/db';

/**
 * Server action: record a reviewer's approve/reject as a hash-chained
 * human_decision event (Invariants 4/6). Only meaningful with a database; a
 * read-only deployment (no DATABASE_URL) no-ops. The actor identity is a
 * placeholder until auth lands; the timestamp is real wall-clock (a genuine
 * human action, not a deterministic replay).
 */
export async function submitDecision(formData: FormData): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    return;
  }
  const cardId = String(formData.get('cardId') ?? '');
  const kind = String(formData.get('kind') ?? '');
  if (cardId === '' || (kind !== 'approve_card' && kind !== 'reject_card')) {
    return;
  }

  const client = createDbClient(databaseUrl, { max: 1 });
  try {
    await recordReviewDecision(client, {
      actorId: 'web-reviewer',
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
