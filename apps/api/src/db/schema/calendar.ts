/**
 * Google Calendar mirror + draft-write queue (docs/00 F3, docs/01 §4).
 * All calendar mutations are drafts confirmed in the dashboard — never auto-book.
 */
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { idColumn, tenantIdColumn, timestamps } from './_columns';
import { calendarDraftActionEnum, calendarDraftSourceEnum, calendarDraftStatusEnum } from './_enums';
import { connectedAccounts } from './tenancy';

export interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus?: string;
}

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    gcalId: text('gcal_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => connectedAccounts.id),
    title: text('title'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    attendees: jsonb('attendees').$type<CalendarAttendee[]>().notNull().default([]),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
    briefSentAt: timestamp('brief_sent_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('calendar_events_gcal_id_uq').on(t.gcalId),
    index('calendar_events_tenant_id_idx').on(t.tenantId),
    index('calendar_events_start_at_idx').on(t.tenantId, t.startAt),
  ],
);

export const calendarDrafts = pgTable(
  'calendar_drafts',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    action: calendarDraftActionEnum('action').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: calendarDraftStatusEnum('status').notNull().default('proposed'),
    sourceType: calendarDraftSourceEnum('source_type').notNull(),
    sourceId: uuid('source_id'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('calendar_drafts_tenant_id_idx').on(t.tenantId),
    index('calendar_drafts_status_idx').on(t.tenantId, t.status),
  ],
);
