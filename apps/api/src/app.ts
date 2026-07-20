/**
 * Fastify app factory. Dependencies are injected so integration tests can drive the real
 * routes with a testcontainer DB + a stub authenticator, and production wires the concrete
 * Clerk/Redis/Postgres adapters (see index.ts).
 */
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Authenticate } from './auth/authenticator';
import { makeRequireAuth } from './auth/requireAuth';
import type { Database } from './db/client';
import { registerHealthRoutes } from './routes/internal/health';
import { registerSettingsRoutes } from './routes/v1/settings';

export interface BuildAppDeps {
  db: Database;
  authenticate: Authenticate;
  pingDb?: () => Promise<boolean>;
  pingRedis: () => Promise<boolean>;
  logger?: boolean;
}

export function buildApp(deps: BuildAppDeps): FastifyInstance {
  const app = Fastify({ logger: deps.logger ?? false });

  const pingDb =
    deps.pingDb ??
    (async () => {
      await deps.db.execute(sql`select 1`);
      return true;
    });

  registerHealthRoutes(app, { pingDb, pingRedis: deps.pingRedis });

  // Everything under /v1 requires a valid Clerk session and carries request.auth.tenantId.
  const requireAuth = makeRequireAuth(deps.authenticate);
  void app.register(
    async (scoped) => {
      scoped.addHook('preHandler', requireAuth);
      registerSettingsRoutes(scoped, deps.db);
    },
    { prefix: '/v1' },
  );

  return app;
}
