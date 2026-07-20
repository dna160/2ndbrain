/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/workers/media.worker.ts
 * Role    : BullMQ consumer for the `media` queue — delegates to MediaService and, on
 *           retry-exhaustion, writes a durable dlq row (docs/03 Phase 2 QC gate).
 * Exports : createMediaWorker()
 */
import { QUEUES } from '@recall/shared/constants';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import type { Database } from '../db/client';
import { dlq } from '../db/schema';
import type { MediaJobData, MediaService } from '../services/media.service';

export interface MediaWorkerDeps {
  connection: Redis;
  db: Database;
  media: MediaService;
  concurrency?: number;
}

export function createMediaWorker(deps: MediaWorkerDeps): Worker<MediaJobData> {
  const worker = new Worker<MediaJobData>(
    QUEUES.media,
    async (job) => {
      await deps.media.fetchAndStore(job.data);
    },
    { connection: deps.connection, concurrency: deps.concurrency ?? 4 },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await deps.db.insert(dlq).values({
        tenantId: job.data.tenantId,
        queue: QUEUES.media,
        jobId: job.id ?? null,
        payload: job.data as unknown as Record<string, unknown>,
        error: { message: err.message },
      });
    }
  });

  return worker;
}
