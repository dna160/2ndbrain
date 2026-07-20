/**
 * Postgres enum types shared across domain schema files (docs/01 §4).
 * Graph/vocabulary enums reuse the single-source arrays from @recall/shared so the DB
 * type and the runtime constant can never drift.
 */
import { ENTITY_KINDS, RELATION_TYPES } from '@recall/shared/constants';
import { pgEnum } from 'drizzle-orm/pg-core';

// ── tenancy ───────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);

// ── events ──────────────────────────────────────────────────────────────────
export const eventSourceEnum = pgEnum('event_source', ['wa', 'gcal', 'upload', 'system']);
export const eventTypeEnum = pgEnum('event_type', [
  'message',
  'audio',
  'image',
  'document',
  'calendar',
  'note',
]);
export const eventDirectionEnum = pgEnum('event_direction', ['inbound', 'outbound', 'system']);

// ── meetings ──────────────────────────────────────────────────────────────────
export const transcriptStatusEnum = pgEnum('transcript_status', [
  'pending',
  'processing',
  'done',
  'failed',
]);
export const diarizationModeEnum = pgEnum('diarization_mode', ['none', 'llm', 'pyannote']);
export const taskStatusEnum = pgEnum('task_status', ['open', 'done', 'dropped']);

// ── memory ────────────────────────────────────────────────────────────────────
export const entityKindEnum = pgEnum('entity_kind', ENTITY_KINDS);
export const relationTypeEnum = pgEnum('relation_type', RELATION_TYPES);
export const sensitivityEnum = pgEnum('sensitivity', ['normal', 'sensitive']);
export const memoryStatusEnum = pgEnum('memory_status', ['active', 'review', 'archived']);
export const memoryReviewReasonEnum = pgEnum('memory_review_reason', [
  'low_confidence',
  'contradiction',
  't3_nomination',
]);
export const memoryReviewResolutionEnum = pgEnum('memory_review_resolution', [
  'approved',
  'edited',
  'rejected',
]);

// ── calendar ──────────────────────────────────────────────────────────────────
export const calendarDraftActionEnum = pgEnum('calendar_draft_action', [
  'create',
  'update',
  'cancel',
]);
export const calendarDraftStatusEnum = pgEnum('calendar_draft_status', [
  'proposed',
  'confirmed',
  'rejected',
]);
export const calendarDraftSourceEnum = pgEnum('calendar_draft_source', [
  'digest',
  'meeting',
  'manual',
]);

// ── ops ───────────────────────────────────────────────────────────────────────
export const digestDeliveredViaEnum = pgEnum('digest_delivered_via', [
  'freeform',
  'template',
  'none',
]);
export const pipelineStatusEnum = pgEnum('pipeline_status', ['running', 'done', 'failed', 'dead']);
