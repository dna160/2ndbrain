/**
 * Fastify app factory. Dependencies are injected so integration tests can drive the real
 * routes with a testcontainer DB + stubs, and production wires the concrete adapters (index.ts).
 */
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Authenticate } from './auth/authenticator';
import { makeRequireAuth } from './auth/requireAuth';
import type { Database } from './db/client';
import type { MetaSignatureGuard } from './middleware/metaSignature';
import { registerMetaWebhookRoutes } from './routes/webhooks/meta';
import { registerDlqRoutes } from './routes/internal/dlq';
import { registerHealthRoutes } from './routes/internal/health';
import { registerCalendarRoutes } from './routes/v1/calendar';
import { registerConversationRoutes } from './routes/v1/conversations';
import { registerDigestRoutes } from './routes/v1/digests';
import { registerEventRoutes } from './routes/v1/events';
import { registerMeetingRoutes } from './routes/v1/meetings';
import { registerMemoryRoutes } from './routes/v1/memory';
import { registerPipelineRoutes } from './routes/v1/pipeline';
import { registerSettingsRoutes } from './routes/v1/settings';
import { registerTaskRoutes } from './routes/v1/tasks';
import { registerUploadRoutes } from './routes/v1/uploads';
import type { Enqueuer, QueueStats } from './queues';
import type { CalendarService } from './services/calendar.service';
import type { ConversationsService } from './services/conversations.service';
import type { DigestService } from './services/digest.service';
import type { IngestService } from './services/ingest.service';
import type { PipelineService } from './services/pipeline.service';
import type { R2Client } from './services/r2.service';
import { GraphService } from './services/memory/graph.service';
import { SpeakerService } from './services/speaker.service';

/** Phase 2 ingestion wiring — optional so Phase 1 tests can build a minimal app. */
export interface IngestionDeps {
  ingest: IngestService;
  metaGuard: MetaSignatureGuard;
  /** Token echoed on Meta's GET webhook handshake (META_WEBHOOK_VERIFY_TOKEN). */
  metaVerifyToken: string;
  resolveTenantId: () => Promise<string | null>;
  r2: Pick<R2Client, 'presignPut'>;
  enqueuer: Pick<Enqueuer, 'enqueue'>;
  pipeline: PipelineService;
  queueStats: QueueStats;
  internalApiKey: string;
}

export interface BuildAppDeps {
  db: Database;
  authenticate: Authenticate;
  pingRedis: () => Promise<boolean>;
  pingDb?: () => Promise<boolean>;
  logger?: boolean;
  ingestion?: IngestionDeps;
  calendarConversations?: { calendar: CalendarService; conversations: ConversationsService };
  digest?: DigestService;
}

export function buildApp(deps: BuildAppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

  // Preserve the raw JSON body so Meta's X-Hub-Signature-256 verifies the exact bytes.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const raw = typeof body === 'string' ? body : body.toString('utf8');
    request.rawBody = raw;
    if (raw.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err instanceof Error ? err : new Error('invalid JSON'), undefined);
    }
  });

  const pingDb =
    deps.pingDb ??
    (async () => {
      await deps.db.execute(sql`select 1`);
      return true;
    });

  registerHealthRoutes(app, { pingDb, pingRedis: deps.pingRedis });

  if (deps.ingestion) {
    const ing = deps.ingestion;
    registerMetaWebhookRoutes(app, {
      ingest: ing.ingest,
      metaGuard: ing.metaGuard,
      verifyToken: ing.metaVerifyToken,
      resolveTenantId: ing.resolveTenantId,
    });
    registerDlqRoutes(app, { db: deps.db, internalApiKey: ing.internalApiKey });
  }

  // Everything under /v1 requires a valid Clerk session and carries request.auth.tenantId.
  const requireAuth = makeRequireAuth(deps.authenticate);
  void app.register(
    async (scoped) => {
      scoped.addHook('preHandler', requireAuth);
      registerSettingsRoutes(scoped, deps.db);
      registerMeetingRoutes(scoped, { db: deps.db, speaker: new SpeakerService({ db: deps.db }) });
      registerEventRoutes(scoped, deps.db);
      registerTaskRoutes(scoped, deps.db);
      registerMemoryRoutes(scoped, { db: deps.db, graph: new GraphService(deps.db) });
      if (deps.digest) registerDigestRoutes(scoped, { db: deps.db, digest: deps.digest });
      if (deps.calendarConversations) {
        registerCalendarRoutes(scoped, {
          db: deps.db,
          calendar: deps.calendarConversations.calendar,
        });
        registerConversationRoutes(scoped, {
          conversations: deps.calendarConversations.conversations,
        });
      }
      if (deps.ingestion) {
        registerUploadRoutes(scoped, {
          db: deps.db,
          r2: deps.ingestion.r2,
          enqueuer: deps.ingestion.enqueuer,
          pipeline: deps.ingestion.pipeline,
        });
        registerPipelineRoutes(scoped, {
          db: deps.db,
          queueStats: deps.ingestion.queueStats,
          enqueuer: deps.ingestion.enqueuer,
        });
      }
    },
    { prefix: '/v1' },
  );

  return app;
}
