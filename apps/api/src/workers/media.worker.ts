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
import type { MediaJobData, MediaService } from '../services/media.service';
import { onFailedToDlq } from './dlq';

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
  worker.on('failed', onFailedToDlq(deps.db, QUEUES.media));
  return worker;
}
