import { defineConfig } from 'drizzle-kit';

// Local-dev fallback matches docker-compose.yml / TOOLS.md; real deployments set DATABASE_URL.
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://regdelta:regdelta@localhost:5432/regdelta';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: { url: databaseUrl },
});
