/**
 * `pnpm db:seed` — idempotent single-tenant seed (docs/03 Phase 1):
 * one tenant + operator user + the operator's own waId in waContacts labeled 'Operator'.
 * Override via SEED_TENANT_NAME / SEED_CLERK_USER_ID / SEED_OPERATOR_WAID.
 */
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { loadConfig } from '../config';
import { createDb } from './client';
import { tenants, users, waContacts } from './schema';

export async function seed(databaseUrl: string, opts: {
  tenantName: string;
  clerkUserId: string;
  operatorWaId: string;
}): Promise<{ tenantId: string }> {
  const { sql, db } = createDb(databaseUrl, { max: 1 });
  try {
    const existing = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.name, opts.tenantName))
      .limit(1);

    const tenantId =
      existing[0]?.id ??
      (await db.insert(tenants).values({ name: opts.tenantName }).returning({ id: tenants.id }))[0]!
        .id;

    await db
      .insert(users)
      .values({ tenantId, clerkUserId: opts.clerkUserId, role: 'owner' })
      .onConflictDoNothing({ target: users.clerkUserId });

    await db
      .insert(waContacts)
      .values({ tenantId, waId: opts.operatorWaId, label: 'Operator' })
      .onConflictDoNothing({ target: waContacts.waId });

    return { tenantId };
  } finally {
    await sql.end();
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const config = loadConfig();
  const clerkUserId = process.env.SEED_CLERK_USER_ID;
  const operatorWaId = process.env.SEED_OPERATOR_WAID;

  // No placeholder fallbacks: the seeded 'Operator' contact becomes the nightly digest's
  // recipient, so a dummy waId would send the operator's briefs to whoever owns that number.
  // This runs on every deploy via preDeployCommand — skip (exit 0) rather than fail the
  // deploy or write junk when the values are not configured yet.
  if (!clerkUserId || !operatorWaId) {
    console.warn(
      '[seed] skipped — set SEED_CLERK_USER_ID and SEED_OPERATOR_WAID to provision the tenant.',
    );
    process.exit(0);
  }

  seed(config.DATABASE_URL, {
    tenantName: process.env.SEED_TENANT_NAME ?? 'Operator Tenant',
    clerkUserId,
    operatorWaId,
  })
    .then(({ tenantId }) => {
      console.log(`[seed] ok — tenant ${tenantId}`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('[seed] failed', err);
      process.exit(1);
    });
}
