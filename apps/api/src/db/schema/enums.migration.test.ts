/**
 * Guard for a bug class that no other gate catches: drizzle-kit only emits CREATE TYPE for
 * pgEnums reachable from the schema entry point (drizzle.config.ts -> schema/index.ts). When
 * _enums.ts was not re-exported there, migrations shipped tables referencing "user_role"
 * without ever creating it — typecheck, lint and every unit test stayed green, and it only
 * failed against a real Postgres (`type "user_role" does not exist`).
 *
 * Runs without a database: it compares declared enums against the generated SQL text.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPgEnum } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as enumsModule from './_enums';
import * as schemaBarrel from './index';

const DRIZZLE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'drizzle');

function migrationSql(): string {
  return readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(path.join(DRIZZLE_DIR, f), 'utf8'))
    .join('\n');
}

function enumNamesOf(mod: Record<string, unknown>): string[] {
  // pgEnum returns a callable, so a `typeof === 'object'` check misses every one of them.
  return Object.values(mod)
    .filter(isPgEnum)
    .map((e) => e.enumName)
    .sort();
}

describe('enum DDL is generated', () => {
  const declared = enumNamesOf(enumsModule as Record<string, unknown>);

  it('declares at least one enum (guards against an empty read)', () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it('re-exports every enum from the schema barrel drizzle-kit reads', () => {
    // The actual root cause: enums invisible to drizzle-kit produce migrations that
    // reference types they never create.
    expect(enumNamesOf(schemaBarrel as Record<string, unknown>)).toEqual(declared);
  });

  it.each(declared)('emits CREATE TYPE for %s', (name) => {
    expect(migrationSql()).toMatch(new RegExp(`CREATE TYPE [^;]*"${name}"`));
  });

  it('creates every enum type the migrations reference', () => {
    const sql = migrationSql();
    const captures = (re: RegExp): string[] =>
      [...sql.matchAll(re)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));

    const created = new Set(captures(/CREATE TYPE\s+(?:"public"\.)?"([a-z_]+)"/g));
    const referenced = new Set(captures(/"[a-z_]+"\s+"([a-z_]+)"(?:\s+DEFAULT|\s+NOT NULL|,|\n)/g));
    const missing = [...referenced].filter((t) => declared.includes(t) && !created.has(t));
    expect(missing).toEqual([]);
  });
});
