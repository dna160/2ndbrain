/**
 * Transcription + meeting notes + tasks (docs/01 §4). The Plaud-grade Meeting Note object.
 * jsonb payload shapes are typed structurally here; their authoritative zod schemas land in
 * @recall/shared during Phase 3 (structuring).
 */
import {
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { idColumn, tenantIdColumn, timestamps } from './_columns';
import { diarizationModeEnum, taskStatusEnum, transcriptStatusEnum } from './_enums';
import { calendarEvents } from './calendar';
import { events } from './events';
import { entities } from './memory';

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  speakerKey: string;
  text: string;
}

export interface MeetingParticipant {
  speakerKey: string;
  entityId?: string;
  suggestedName?: string;
  confirmed: boolean;
  confidence: number;
}

export interface MeetingTopic {
  title: string;
  startMs: number;
  endMs: number;
  subnotes: string[];
}

export interface MeetingRecommendation {
  entityId?: string;
  speakerKey: string;
  advice: string;
}

export const transcripts = pgTable(
  'transcripts',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    status: transcriptStatusEnum('status').notNull().default('pending'),
    language: text('language'),
    languageConfidence: real('language_confidence'),
    sttProvider: text('stt_provider'),
    diarizationMode: diarizationModeEnum('diarization_mode').notNull().default('none'),
    segments: jsonb('segments').$type<TranscriptSegment[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    index('transcripts_tenant_id_idx').on(t.tenantId),
    index('transcripts_event_id_idx').on(t.eventId),
  ],
);

export const meetings = pgTable(
  'meetings',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    transcriptId: uuid('transcript_id')
      .notNull()
      .references(() => transcripts.id),
    calendarEventId: uuid('calendar_event_id').references(() => calendarEvents.id),
    title: text('title').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    durationSec: real('duration_sec'),
    participants: jsonb('participants').$type<MeetingParticipant[]>().notNull().default([]),
    topics: jsonb('topics').$type<MeetingTopic[]>().notNull().default([]),
    summary: text('summary'),
    decisions: jsonb('decisions').$type<string[]>().notNull().default([]),
    openQuestions: jsonb('open_questions').$type<string[]>().notNull().default([]),
    recommendations: jsonb('recommendations')
      .$type<MeetingRecommendation[]>()
      .notNull()
      .default([]),
    attributionConfidence: real('attribution_confidence'),
    ...timestamps,
  },
  (t) => [
    index('meetings_tenant_id_idx').on(t.tenantId),
    index('meetings_occurred_at_idx').on(t.tenantId, t.occurredAt),
  ],
);

export const tasks = pgTable(
  'tasks',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    title: text('title').notNull(),
    status: taskStatusEnum('status').notNull().default('open'),
    ownerEntityId: uuid('owner_entity_id').references(() => entities.id),
    dueAt: timestamp('due_at', { withTimezone: true }),
    sourceEventId: uuid('source_event_id').references(() => events.id),
    meetingId: uuid('meeting_id').references(() => meetings.id),
    normalizedLang: text('normalized_lang').notNull().default('en'),
    ...timestamps,
  },
  (t) => [
    index('tasks_tenant_id_idx').on(t.tenantId),
    index('tasks_status_idx').on(t.tenantId, t.status),
  ],
);
