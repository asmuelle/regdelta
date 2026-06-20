import { createDbClient } from '@regdelta/db';
import { inngest } from './client';
import { runAndPersist } from './runAndPersist';

/**
 * Daily crawl (DESIGN.md scheduling): the deterministic pipeline → persist, on a
 * UTC cron. No-ops loudly when DATABASE_URL is absent rather than failing silently,
 * so a misconfigured deploy is visible in the run result. Inngest provides the
 * retry/replay envelope; the work itself stays deterministic.
 */
export const dailyCrawl = inngest.createFunction(
  { id: 'daily-crawl-and-persist' },
  { cron: '0 6 * * *' },
  async () => {
    const databaseUrl = process.env['DATABASE_URL'];
    if (databaseUrl === undefined || databaseUrl.length === 0) {
      return { skipped: true, reason: 'DATABASE_URL not set' };
    }
    // Schema migrations are a deploy step (`just migrate`), not runtime work.
    const client = createDbClient(databaseUrl, { max: 1 });
    try {
      const summary = await runAndPersist(client);
      return { skipped: false, ...summary };
    } finally {
      await client.close();
    }
  },
);
