/**
 * GET /internal/health — liveness + datastore reachability (docs/01 §7).
 * Open (no auth) so Railway's healthcheck can hit it. 200 when both stores answer, else 503.
 */
import type { FastifyInstance } from 'fastify';

export interface HealthDeps {
  pingDb: () => Promise<boolean>;
  pingRedis: () => Promise<boolean>;
}

async function safe(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthDeps): void {
  app.get('/internal/health', async (_request, reply) => {
    const [db, redis] = await Promise.all([safe(deps.pingDb), safe(deps.pingRedis)]);
    const ok = db && redis;
    return reply.code(ok ? 200 : 503).send({ status: ok ? 'ok' : 'degraded', db, redis });
  });
}
