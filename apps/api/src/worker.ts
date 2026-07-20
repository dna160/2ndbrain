/**
 * Worker bootstrap (MODE=worker) — same image as the api (docs/01 §1). BullMQ consumers:
 * media (P2), transcription + structuring (P3), calendar sync + briefs (P5, repeatable).
 */
import { asc, eq } from 'drizzle-orm';
import type { Worker } from 'bullmq';

import { loadConfig } from './config';
import { createDb } from './db/client';
import { users, waContacts } from './db/schema';
import { BullEnqueuer, createRedisConnection } from './queues';
import { BriefsService } from './services/briefs.service';
import { CalendarService } from './services/calendar.service';
import { GoogleApiCalendarClient } from './services/google/calendar.client';
import { googleTokenProvider } from './services/google/token';
import { DeepSeekClient } from './services/llm/deepseek';
import { MediaService } from './services/media.service';
import { ConsolidationService } from './services/memory/consolidation.service';
import { Bge3EmbeddingsProvider } from './services/memory/embeddings';
import { GraphService } from './services/memory/graph.service';
import { RetrievalService } from './services/memory/retrieval.service';
import { GraphMetaMediaClient } from './services/meta/media.client';
import { GraphMetaSendClient } from './services/meta/send.client';
import { PipelineService } from './services/pipeline.service';
import { S3R2Client } from './services/r2.service';
import { StructuringService } from './services/structuring.service';
import { getDiarizationProvider } from './services/stt/diarization.provider';
import { GroqWhisperProvider } from './services/stt/groqWhisper';
import { TranscriptionService } from './services/transcription.service';
import { WaSendService } from './services/waSend.service';
import { createMediaWorker } from './workers/media.worker';
import { createScheduledWorkers } from './workers/scheduled.worker';
import { createStructuringWorker } from './workers/structuring.worker';
import { createTranscriptionWorker } from './workers/transcription.worker';

async function main(): Promise<void> {
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
  // ── Memory (Phase 6): embeddings + graph + retrieval + consolidation ────────
  const embeddings = new Bge3EmbeddingsProvider(config.EMBEDDINGS_API_KEY, config.EMBEDDINGS_URL);
  const graph = new GraphService(db);
  const retrieval = new RetrievalService({ db, embeddings });
  const consolidation = new ConsolidationService({
    db,
    llm: new DeepSeekClient(config.DEEPSEEK_API_KEY),
    embeddings,
    graph,
  });

  const structuring = new StructuringService({
    db,
    llm: new DeepSeekClient(config.DEEPSEEK_API_KEY),
    pipeline,
    // Per-participant memory context for recommendations (docs/00 F4).
    retrieval: (job) => retrieval.contextFor(job.tenantId, { includeSensitive: false }),
  });

  const calendar = new CalendarService({
    db,
    client: new GoogleApiCalendarClient(
      googleTokenProvider(config.CLERK_SECRET_KEY, async () => {
        const [u] = await db.select({ clerkUserId: users.clerkUserId }).from(users).orderBy(asc(users.createdAt)).limit(1);
        return u?.clerkUserId ?? null;
      }),
    ),
  });
  const [operator] = await db
    .select({ waId: waContacts.waId })
    .from(waContacts)
    .where(eq(waContacts.label, 'Operator'))
    .limit(1);
  const briefs = new BriefsService({
    db,
    llm: new DeepSeekClient(config.DEEPSEEK_API_KEY),
    waSend: new WaSendService({
      db,
      meta: new GraphMetaSendClient(config.META_ACCESS_TOKEN, config.META_PHONE_NUMBER_ID),
      templateName: config.WA_UTILITY_TEMPLATE,
    }),
    operatorWaId: operator?.waId ?? '',
    retrieval: (tenantId, _eventId) => retrieval.contextFor(tenantId, { includeSensitive: false }),
  });

  const workers: Worker[] = [
    createMediaWorker({ connection, db, media }),
    createTranscriptionWorker({ connection, db, r2, transcription, enqueuer }),
    createStructuringWorker({ connection, db, structuring, pipeline }),
    ...(await createScheduledWorkers({ connection, db, calendar, briefs, consolidation })),
  ];
  console.log('[worker] booted — media, transcription, structuring, calendar-sync, briefs.');

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

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
