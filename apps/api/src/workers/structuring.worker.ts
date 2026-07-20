/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/workers/structuring.worker.ts
 * Role    : BullMQ consumer for `recall-structuring` — run the Meeting Note pass, then close
 *           the pipeline run (persisted → complete) (docs/03 Phase 3 task 3).
 * Exports : createStructuringWorker()
 */
import { QUEUES } from '@recall/shared/constants';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import type { Database } from '../db/client';
import { events } from '../db/schema';
import type { PipelineService } from '../services/pipeline.service';
import type { StructuringService } from '../services/structuring.service';
import { onFailedToDlq } from './dlq';

export interface StructuringJobData {
  tenantId: string;
  eventId: string;
  transcriptId: string;
  runId: string;
}

export interface StructuringWorkerDeps {
  connection: Redis;
  db: Database;
  structuring: StructuringService;
  pipeline: Pick<PipelineService, 'stage' | 'completeRun'>;
  concurrency?: number;
}

export function createStructuringWorker(deps: StructuringWorkerDeps): Worker<StructuringJobData> {
  const worker = new Worker<StructuringJobData>(
    QUEUES.structuring,
    async (job) => {
      const { tenantId, eventId, transcriptId, runId } = job.data;
      const [ev] = await deps.db
        .select({ occurredAt: events.occurredAt })
        .from(events)
        .where(eq(events.id, eventId));

      await deps.structuring.structure({
        tenantId,
        eventId,
        transcriptId,
        runId,
        occurredAt: ev?.occurredAt ?? new Date(),
      });

      await deps.pipeline.stage(runId, 'persisted', async () => undefined);
      await deps.pipeline.completeRun(runId);
    },
    { connection: deps.connection, concurrency: deps.concurrency ?? 2 },
  );
  worker.on('failed', onFailedToDlq(deps.db, QUEUES.structuring));
  return worker;
}
