/**
 * Fastify HTTP bootstrap (MODE=http). Wires Postgres/Clerk/Redis/R2 + ingestion into
 * buildApp and listens. The worker shares this image under MODE=worker (docs/01 §1).
 */
import { asc, eq } from 'drizzle-orm';

import { buildApp } from './app';
import { createAuthenticator } from './auth/authenticator';
import { clerkVerify, resolveTenantFromDb } from './auth/clerk';
import { loadConfig } from './config';
import { createDb } from './db/client';
import { seed } from './db/seed';
import { tenants, users, waContacts } from './db/schema';
import { makeMetaSignatureGuard } from './middleware/metaSignature';
import { BullEnqueuer, createQueueStats, createRedisConnection } from './queues';
import { CalendarService } from './services/calendar.service';
import { ConversationsService } from './services/conversations.service';
import { DigestService } from './services/digest.service';
import { GoogleApiCalendarClient } from './services/google/calendar.client';
import { googleTokenProvider } from './services/google/token';
import { IngestService } from './services/ingest.service';
import { DeepSeekClient } from './services/llm/deepseek';
import { CloudflareEmbeddingsProvider } from './services/memory/embeddings';
import { RetrievalService } from './services/memory/retrieval.service';
import { GraphMetaSendClient } from './services/meta/send.client';
import { PipelineService } from './services/pipeline.service';
import { S3R2Client } from './services/r2.service';
import { WaSendService } from './services/waSend.service';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);

  // Provision the single tenant at boot, idempotently. This deliberately does NOT live in
  // Railway's preDeployCommand: that field cannot chain commands — `&&` is stored verbatim
  // and never shell-interpreted, so only the first command ever runs — and a value set via
  // the dashboard/API silently overrides infra/railway.api.json. Booting is the one path
  // guaranteed to execute, so provisioning belongs here.
  if (config.SEED_CLERK_USER_ID && config.SEED_OPERATOR_WAID) {
    const { tenantId } = await seed(config.DATABASE_URL, {
      tenantName: config.SEED_TENANT_NAME,
      clerkUserId: config.SEED_CLERK_USER_ID,
      operatorWaId: config.SEED_OPERATOR_WAID,
    });
    console.log(`[boot] tenant provisioned: ${tenantId}`);
  } else {
    console.warn('[boot] SEED_CLERK_USER_ID / SEED_OPERATOR_WAID unset — tenant NOT provisioned;'
      + ' inbound webhooks will 503 and /v1 will 403.');
  }

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
  const metaGuard = makeMetaSignatureGuard({ appSecret: config.META_APP_SECRET });
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
  const conversations = new ConversationsService({ db, waSend });
  const calendar = new CalendarService({
    db,
    client: new GoogleApiCalendarClient(
      googleTokenProvider(config.CLERK_SECRET_KEY, resolveOwnerClerkUserId),
    ),
  });
  const digest = new DigestService({
    db,
    llm: new DeepSeekClient(config.DEEPSEEK_API_KEY),
    retrieval: new RetrievalService({
      db,
      embeddings: new CloudflareEmbeddingsProvider(config.EMBEDDINGS_API_KEY, config.EMBEDDINGS_URL),
    }),
    waSend,
    calendar,
    operatorWaId:
      (await db.select({ waId: waContacts.waId }).from(waContacts).where(eq(waContacts.label, 'Operator')).limit(1))[0]
        ?.waId ?? '',
  });

  const app = buildApp({
    db,
    authenticate,
    pingRedis: async () => (await connection.ping()) === 'PONG',
    cors: {
      appUrl: config.APP_URL,
      isProduction: config.NODE_ENV === 'production',
      extra: config.CORS_ORIGIN,
    },
    logger: true,
    ingestion: {
      ingest,
      metaGuard,
      metaVerifyToken: config.META_WEBHOOK_VERIFY_TOKEN,
      resolveTenantId,
      r2,
      enqueuer,
      pipeline,
      queueStats: createQueueStats(connection),
      internalApiKey: config.INTERNAL_API_KEY,
    },
    calendarConversations: { calendar, conversations },
    digest,
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
