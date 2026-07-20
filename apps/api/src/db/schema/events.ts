/**
 * The substrate (docs/01 §4). Every captured signal — WA message, voice note, upload,
 * calendar item — normalizes into `events`. Conversations are DERIVED by grouping wa
 * message events on `senderWaId`; there is no separate conversations table in v1.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { idColumn, tenantIdColumn, timestamps } from './_columns';
import { eventDirectionEnum, eventSourceEnum, eventTypeEnum } from './_enums';

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    r2Key: text('r2_key').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(),
    durationSec: real('duration_sec'),
    sha256: text('sha256').notNull(),
    ...timestamps,
  },
  (t) => [
    index('media_assets_tenant_id_idx').on(t.tenantId),
    index('media_assets_sha256_idx').on(t.tenantId, t.sha256),
  ],
);

export const events = pgTable(
  'events',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    source: eventSourceEnum('source').notNull(),
    type: eventTypeEnum('type').notNull(),
    direction: eventDirectionEnum('direction').notNull().default('inbound'),
    /** metaMessageId / gcalId — nullable, but unique for idempotent ingest. */
    externalId: text('external_id'),
    senderWaId: text('sender_wa_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    content: text('content'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
    mediaAssetId: uuid('media_asset_id').references(() => mediaAssets.id),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // Idempotency key — Postgres allows multiple NULLs, so non-external events are unconstrained.
    uniqueIndex('events_external_id_uq').on(t.externalId),
    index('events_tenant_id_idx').on(t.tenantId),
    index('events_sender_wa_id_idx').on(t.tenantId, t.senderWaId, t.occurredAt),
    index('events_occurred_at_idx').on(t.tenantId, t.occurredAt),
  ],
);
