/**
 * Tenancy + contact registry (docs/01 §4).
 * `tenantId` on every table; single-tenant today, multi-tenant tomorrow.
 */
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { idColumn, tenantIdColumn, timestamps } from './_columns';
import { userRoleEnum } from './_enums';

export const tenants = pgTable('tenants', {
  id: idColumn(),
  name: text('name').notNull(),
  ...timestamps,
});

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    clerkUserId: text('clerk_user_id').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_clerk_user_id_uq').on(t.clerkUserId),
    index('users_tenant_id_idx').on(t.tenantId),
  ],
);

/**
 * Contact registry — auto-upserted on first inbound from any sender.
 * `blocked=true` is the blacklist (ingest drops, nothing persisted). The blacklist lives
 * ONLY in Recall (docs/00 F1). Blacklist purge is the only permitted hard-delete path.
 */
export const waContacts = pgTable(
  'wa_contacts',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    waId: text('wa_id').notNull(),
    /** Operator-assigned name (PATCH /v1/settings/contacts/:waId). Always wins for display. */
    label: text('label'),
    /** WhatsApp profile name from the webhook's contacts[].profile.name. Refreshed on every
     *  inbound because the sender can change it; never overwrites `label`. */
    profileName: text('profile_name'),
    blocked: boolean('blocked').notNull().default(false),
    botActiveUntil: timestamp('bot_active_until', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    purgedAt: timestamp('purged_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('wa_contacts_wa_id_uq').on(t.waId),
    index('wa_contacts_tenant_id_idx').on(t.tenantId),
  ],
);

/**
 * Connected OAuth accounts (Google). Tokens live in Clerk; we store metadata + the
 * incremental sync cursor only (docs/01 §4).
 */
export const connectedAccounts = pgTable(
  'connected_accounts',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    provider: text('provider').notNull().default('google'),
    clerkUserId: text('clerk_user_id').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
    externalId: text('external_id'),
    syncCursor: text('sync_cursor'),
    ...timestamps,
  },
  (t) => [index('connected_accounts_tenant_id_idx').on(t.tenantId)],
);
