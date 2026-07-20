/**
 * Operational ledger (docs/01 §4, docs/00 F9). `pipelineRuns` is the unit-economics ledger:
 * one row per job, stage transitions with latency, STT seconds + token counts + IDR cost.
 * A job that doesn't log its stages is a bug (CLAUDE.md).
 */
import type { PipelineStage } from '@recall/shared';
import {
  date,
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
import { digestDeliveredViaEnum, pipelineStatusEnum } from './_enums';

export interface PipelineStageEntry {
  stage: PipelineStage;
  at: string; // ISO timestamp
  ms: number;
  ok: boolean;
  err?: string;
}

export interface DigestWindowState {
  windowOpen: boolean;
  lastInboundAt?: string;
  reason?: string;
}

export const pipelineRuns = pgTable(
  'pipeline_runs',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    jobType: text('job_type').notNull(),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    status: pipelineStatusEnum('status').notNull().default('running'),
    stages: jsonb('stages').$type<PipelineStageEntry[]>().notNull().default([]),
    sttSeconds: real('stt_seconds').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costIdr: integer('cost_idr').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    error: jsonb('error').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    index('pipeline_runs_tenant_id_idx').on(t.tenantId),
    index('pipeline_runs_status_idx').on(t.tenantId, t.status),
    index('pipeline_runs_job_type_idx').on(t.tenantId, t.jobType),
    index('pipeline_runs_ref_idx').on(t.refType, t.refId),
  ],
);

export const digests = pgTable(
  'digests',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    date: date('date').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    deliveredVia: digestDeliveredViaEnum('delivered_via').notNull().default('none'),
    windowState: jsonb('window_state').$type<DigestWindowState>(),
    ...timestamps,
  },
  (t) => [uniqueIndex('digests_tenant_date_uq').on(t.tenantId, t.date)],
);

/** Dead-letter visibility for poisoned queue jobs (docs/01 §5; surfaced via internal route). */
export const dlq = pgTable(
  'dlq',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    queue: text('queue').notNull(),
    jobId: text('job_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    error: jsonb('error').$type<Record<string, unknown>>(),
    failedAt: timestamp('failed_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index('dlq_tenant_id_idx').on(t.tenantId), index('dlq_queue_idx').on(t.queue)],
);
