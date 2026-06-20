/**
 * Postgres connection + migration helpers (DESIGN.md: Postgres 16 + pgvector).
 * Thin wrapper over postgres.js + drizzle; the app and the integration test both
 * go through here so connection handling is in one place.
 */
import { fileURLToPath } from 'node:url';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from './schema';

/** Absolute path to the drizzle migrations folder (journal + .sql files). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

export interface DbClient {
  readonly db: PostgresJsDatabase<typeof schema>;
  readonly sql: postgres.Sql;
  close(): Promise<void>;
}

export interface DbClientOptions {
  /** Cap the pool — tests use 1 to keep teardown deterministic. */
  readonly max?: number;
}

export function createDbClient(databaseUrl: string, options: DbClientOptions = {}): DbClient {
  if (databaseUrl.trim().length === 0) {
    throw new Error('createDbClient: databaseUrl is empty — set DATABASE_URL');
  }
  const sql = postgres(databaseUrl, { max: options.max ?? 10, onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

/** Apply all pending migrations (journal order), including the append-only trigger. */
export async function applyMigrations(client: DbClient): Promise<void> {
  await migrate(client.db, { migrationsFolder: MIGRATIONS_DIR });
}
