/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/workers/transcription.worker.ts
 * Role    : BullMQ consumer for `recall-transcription` — download media from R2, transcribe,
 *           persist transcript, then enqueue `structuring` (docs/03 Phase 3 task 2).
 * Exports : createTranscriptionWorker()
 */
import { QUEUES } from '@recall/shared/constants';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import type { Database } from '../db/client';
import { mediaAssets } from '../db/schema';
import type { Enqueuer } from '../queues';
import type { R2Client } from '../services/r2.service';
import type { TranscriptionService } from '../services/transcription.service';
import { onFailedToDlq } from './dlq';

export interface TranscriptionJobData {
  tenantId: string;
  eventId: string;
  mediaAssetId: string;
  runId: string;
}

export interface TranscriptionWorkerDeps {
  connection: Redis;
  db: Database;
  r2: Pick<R2Client, 'get'>;
  transcription: TranscriptionService;
  enqueuer: Pick<Enqueuer, 'enqueue'>;
  concurrency?: number;
}

const MIME_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
};

function filenameFor(id: string, mime: string): string {
  const base = mime.split(';')[0]?.trim() ?? '';
  return `${id}.${MIME_EXT[base] ?? 'ogg'}`;
}

export function createTranscriptionWorker(deps: TranscriptionWorkerDeps): Worker<TranscriptionJobData> {
  const worker = new Worker<TranscriptionJobData>(
    QUEUES.transcription,
    async (job) => {
      const { tenantId, eventId, mediaAssetId, runId } = job.data;
      const [asset] = await deps.db
        .select({ r2Key: mediaAssets.r2Key, mime: mediaAssets.mime })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, mediaAssetId));
      if (!asset) throw new Error(`transcription: media asset ${mediaAssetId} not found`);

      const audio = await deps.r2.get(asset.r2Key);
      const { transcriptId } = await deps.transcription.transcribe({
        tenantId,
        eventId,
        runId,
        audio,
        filename: filenameFor(mediaAssetId, asset.mime),
      });

      await deps.enqueuer.enqueue(QUEUES.structuring, 'structuring.run', {
        tenantId,
        eventId,
        transcriptId,
        runId,
      });
    },
    { connection: deps.connection, concurrency: deps.concurrency ?? 2 },
  );
  worker.on('failed', onFailedToDlq(deps.db, QUEUES.transcription));
  return worker;
}
