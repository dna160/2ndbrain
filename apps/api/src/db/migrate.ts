/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/db/migrate.ts
 * Role    : Idempotent migration runner — deduped from Lynkbot apps/api/src/migrate.ts
 *           (schema_migrations tracking table, transaction-per-file, safe on every deploy).
 *           Adapted to apply the drizzle-kit-generated .sql files in ./drizzle.
 * Exports : runMigrations()
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { loadConfig } from '../config';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');
const MIGRATIONS_TABLE = 'schema_migrations';

export async function runMigrations(
  databaseUrl: string,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    // pgvector must exist before any migration declares `vector(1024)`. This lives here, not
    // in the .sql, because drizzle-kit does not emit CREATE EXTENSION — a regenerated
    // migration silently drops it (which is how the enum DDL was lost). Idempotent.
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    // Tracking table — mirrors the Lynkbot runner.
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql(MIGRATIONS_TABLE)} (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    let files: string[];
    try {
      const all = await readdir(migrationsDir);
      files = all.filter((f) => f.endsWith('.sql')).sort(); // drizzle-kit meta/ dir is skipped
    } catch (err) {
      console.warn('[migrate] could not read migrations dir:', err);
      return;
    }

    for (const file of files) {
      const [row] = await sql`
        SELECT filename FROM ${sql(MIGRATIONS_TABLE)} WHERE filename = ${file}
      `;
      if (row) continue;

      const migrationSql = await readFile(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] applying ${file}…`);
      await sql.begin(async (tx) => {
        await tx.unsafe(migrationSql);
        await tx`INSERT INTO ${tx(MIGRATIONS_TABLE)} (filename) VALUES (${file})`;
      });
      console.log(`[migrate] ✓ ${file}`);
    }

    console.log('[migrate] up to date');
  } finally {
    await sql.end();
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { DATABASE_URL } = loadConfig();
  runMigrations(DATABASE_URL)
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}
