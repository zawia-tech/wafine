import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/** Any drizzle Postgres database (postgres-js in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Connect to Postgres. For Supabase use the session pooler (IPv4, port 5432);
 * pass `caFile` (stack/certs/supabase-ca.crt) to verify TLS, otherwise TLS is required
 * but the chain is not pinned.
 */
export function createDb(url: string, caFile?: string) {
  const client = postgres(url, {
    max: 5,
    ssl: caFile ? { ca: readFileSync(caFile, 'utf8') } : 'require',
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}
