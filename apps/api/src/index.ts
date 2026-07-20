/**
 * Fastify HTTP bootstrap (MODE=http). Wires Postgres/Clerk/Redis/R2 + ingestion into
 * buildApp and listens. The worker shares this image under MODE=worker (docs/01 §1).
 */
import { asc } from 'drizzle-orm';

import { buildApp } from './app';
import { createAuthenticator } from './auth/authenticator';
import { clerkVerify, resolveTenantFromDb } from './auth/clerk';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { tenants, users } from './db/schema';
import { makeRelayHmacGuard } from './middleware/relayHmac';
import { BullEnqueuer, createQueueStats, createRedisConnection } from './queues';
import { CalendarService } from './services/calendar.service';
import { ConversationsService } from './services/conversations.service';
import { GoogleApiCalendarClient } from './services/google/calendar.client';
import { googleTokenProvider } from './services/google/token';
import { IngestService } from './services/ingest.service';
import { LynkbotTakeoverClient } from './services/lynkbot.client';
import { GraphMetaSendClient } from './services/meta/send.client';
import { PipelineService } from './services/pipeline.service';
import { S3R2Client } from './services/r2.service';
import { WaSendService } from './services/waSend.service';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);
  const connection = createRedisConnection(config.REDIS_URL);

  const enqueuer = new BullEnqueuer(connection);
  const pipeline = new PipelineService(db);
  const ingest = new IngestService({ db, enqueuer, pipeline });
  const r2 = new S3R2Client({
    accountId: config.R2_ACCOUNT_ID,
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    bucket: config.R2_BUCKET,
  });
  const relayGuard = makeRelayHmacGuard({
    secret: config.LYNKBOT_RELAY_SECRET,
    maxSkewMs: config.RELAY_MAX_SKEW_MS,
  });
  const resolveTenantId = async (): Promise<string | null> => {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .orderBy(asc(tenants.createdAt))
      .limit(1);
    return rows[0]?.id ?? null;
  };

  const authenticate = createAuthenticator({
    verify: clerkVerify(config.CLERK_SECRET_KEY),
    resolveTenant: resolveTenantFromDb(db),
  });

  // ── Phase 5: waSend + conversations + calendar ──────────────────────────────
  const resolveOwnerClerkUserId = async (): Promise<string | null> => {
    const rows = await db
      .select({ clerkUserId: users.clerkUserId })
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);
    return rows[0]?.clerkUserId ?? null;
  };
  const waSend = new WaSendService({
    db,
    meta: new GraphMetaSendClient(config.META_ACCESS_TOKEN, config.META_PHONE_NUMBER_ID),
    templateName: config.WA_UTILITY_TEMPLATE,
  });
  const conversations = new ConversationsService({
    db,
    waSend,
    takeover: new LynkbotTakeoverClient(config.LYNKBOT_INTERNAL_URL, config.INTERNAL_API_KEY),
  });
  const calendar = new CalendarService({
    db,
    client: new GoogleApiCalendarClient(
      googleTokenProvider(config.CLERK_SECRET_KEY, resolveOwnerClerkUserId),
    ),
  });

  const app = buildApp({
    db,
    authenticate,
    pingRedis: async () => (await connection.ping()) === 'PONG',
    logger: true,
    ingestion: {
      ingest,
      relayGuard,
      resolveTenantId,
      r2,
      enqueuer,
      pipeline,
      queueStats: createQueueStats(connection),
      internalApiKey: config.INTERNAL_API_KEY,
    },
    calendarConversations: { calendar, conversations },
  });

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.info(`recall api listening on :${config.PORT} (mode=${config.MODE})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
