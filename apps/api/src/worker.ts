/**
 * Worker bootstrap (MODE=worker) — same image as the api (docs/01 §1). Registers BullMQ
 * consumers. Phase 2 wires the media worker; transcription/structuring/etc. land in later phases.
 */
import { loadConfig } from './config';
import { createDb } from './db/client';
import { BullEnqueuer, createRedisConnection } from './queues';
import { MediaService } from './services/media.service';
import { GraphMetaMediaClient } from './services/meta/media.client';
import { PipelineService } from './services/pipeline.service';
import { S3R2Client } from './services/r2.service';
import { createMediaWorker } from './workers/media.worker';

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
  const meta = new GraphMetaMediaClient(config.META_ACCESS_TOKEN);
  const media = new MediaService({ db, r2, meta, enqueuer, pipeline });

  const mediaWorker = createMediaWorker({ connection, db, media });
  console.log('[worker] booted — media worker consuming.');

  const shutdown = (signal: string): void => {
    console.log(`[worker] received ${signal}, shutting down.`);
    void (async () => {
      await mediaWorker.close();
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
