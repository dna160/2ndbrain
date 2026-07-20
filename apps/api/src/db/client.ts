/**
 * Postgres (postgres.js) + Drizzle client factory. One pool per process; the schema barrel
 * is bound so `db.query.*` relational helpers are available.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

export type Schema = typeof schema;

export interface DbHandle {
  sql: postgres.Sql;
  db: ReturnType<typeof drizzle<Schema>>;
}

export function createDb(databaseUrl: string, options?: { max?: number }): DbHandle {
  const sql = postgres(databaseUrl, { max: options?.max ?? 10 });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

export type Database = DbHandle['db'];
