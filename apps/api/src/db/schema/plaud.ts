/**
 * Plaud meeting-capture tables (docs/05 §4). `tenantId` on every table.
 *   plaudRecordings — one row per Plaud file; also the readiness state machine's persistence
 *                     and the idempotency ledger (unique on tenantId+plaudId).
 *   plaudSyncState  — per-tenant poll cursor, failure counter, and WA-command rate limit.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { idColumn, tenantIdColumn, timestamps } from './_columns';
import { plaudReadinessEnum } from './_enums';

export const plaudRecordings = pgTable(
  'plaud_recordings',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    /** Plaud's file id — the idempotency key. */
    plaudId: text('plaud_id').notNull(),
    name: text('name').notNull().default(''),
    startAt: timestamp('start_at', { withTimezone: true }),
    durationMs: integer('duration_ms').notNull().default(0),
    serialNumber: text('serial_number'),
    readiness: plaudReadinessEnum('readiness').notNull().default('discovered'),
    /** SHA-256 over normalized transcript + notes; change → supersede + re-extract (docs/05 §3.5). */
    contentHash: text('content_hash'),
    transcriptR2Key: text('transcript_r2_key'),
    notesR2Key: text('notes_r2_key'),
    /** Links into the substrate once imported. */
    eventId: uuid('event_id'),
    transcriptId: uuid('transcript_id'),
    meetingId: uuid('meeting_id'),
    calendarEventId: uuid('calendar_event_id'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }),
    stalledAlertSentAt: timestamp('stalled_alert_sent_at', { withTimezone: true }),
    error: jsonb('error').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('plaud_recordings_plaud_id_uq').on(t.tenantId, t.plaudId),
    index('plaud_recordings_readiness_idx').on(t.tenantId, t.readiness),
  ],
);

export const plaudSyncState = pgTable(
  'plaud_sync_state',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    /** Opaque Plaud cursor from the last page. */
    cursor: text('cursor'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    /** Time-overlap watermark; polls re-scan back this far to tolerate a clock we don't own. */
    lastSeenCreatedAt: timestamp('last_seen_created_at', { withTimezone: true }),
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    lastError: text('last_error'),
    /** 'http' primary, 'cli' fallback (docs/05 §3.1). */
    adapterMode: text('adapter_mode').notNull().default('http'),
    /** WA `sync now` rate limit (1/min). */
    lastCommandAt: timestamp('last_command_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('plaud_sync_state_tenant_uq').on(t.tenantId)],
);
