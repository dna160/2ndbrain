/**
 * Column helpers enforcing the CLAUDE.md hard conventions on every table:
 * uuid pk (gen_random_uuid), `tenantId` not-null (+ caller adds the index),
 * and createdAt/updatedAt timestamptz.
 */
import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const idColumn = () => uuid('id').primaryKey().defaultRandom();

export const tenantIdColumn = () => uuid('tenant_id').notNull();

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
