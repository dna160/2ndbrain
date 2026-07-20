/**
 * Worker bootstrap (MODE=worker) — same image as the api (docs/01 §1). Registers BullMQ
 * consumers: media (Phase 2), transcription + structuring (Phase 3).
 */
import type { Worker } from 'bullmq';

import { loadConfig } from './config';
import { createDb } from './db/client';
import { BullEnqueuer, createRedisConnection } from './queues';
import { DeepSeekClient } from './services/llm/deepseek';
import { MediaService } from './services/media.service';
import { GraphMetaMediaClient } from './services/meta/media.client';
import { PipelineService } from './services/pipeline.service';
import { S3R2Client } from './services/r2.service';
import { StructuringService } from './services/structuring.service';
import { getDiarizationProvider } from './services/stt/diarization.provider';
import { GroqWhisperProvider } from './services/stt/groqWhisper';
import { TranscriptionService } from './services/transcription.service';
import { createMediaWorker } from './workers/media.worker';
import { createStructuringWorker } from './workers/structuring.worker';
import { createTranscriptionWorker } from './workers/transcription.worker';

function main(): void {
  const config = loadConfig();
  if (config.MODE !== 'worker') {
    console.warn(`[worker] started with MODE=${config.MODE}; expected 'worker'.`);
  }

  const { db } = createDb(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);
  const enqueuer = new BullEnqueuer(connection);
  const pipeline = new PipelineService(db);
  const r2 = new S3R2Client({
    accountId: config.R2_ACCOUNT_ID,
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    bucket: config.R2_BUCKET,
  });

  const media = new MediaService({
    db,
    r2,
    meta: new GraphMetaMediaClient(config.META_ACCESS_TOKEN),
    enqueuer,
    pipeline,
  });
  const transcription = new TranscriptionService({
    db,
    stt: new GroqWhisperProvider(config.GROQ_API_KEY),
    diarization: getDiarizationProvider(config.DIARIZATION),
    diarizationMode: config.DIARIZATION,
    pipeline,
  });
  const structuring = new StructuringService({
    db,
    llm: new DeepSeekClient(config.DEEPSEEK_API_KEY),
    pipeline,
  });

  const workers: Worker[] = [
    createMediaWorker({ connection, db, media }),
    createTranscriptionWorker({ connection, db, r2, transcription, enqueuer }),
    createStructuringWorker({ connection, db, structuring, pipeline }),
  ];
  console.log('[worker] booted — media, transcription, structuring consuming.');

  const shutdown = (signal: string): void => {
    console.log(`[worker] received ${signal}, shutting down.`);
    void (async () => {
      await Promise.all(workers.map((w) => w.close()));
      await enqueuer.close();
      await connection.quit();
      process.exit(0);
    })();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
