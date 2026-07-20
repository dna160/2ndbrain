/**
 * Fastify HTTP bootstrap (MODE=http). Wires the concrete Postgres/Clerk/Redis adapters into
 * buildApp and listens. The worker shares this image under MODE=worker (docs/01 §1).
 */
import Redis from 'ioredis';

import { buildApp } from './app';
import { createAuthenticator } from './auth/authenticator';
import { clerkVerify, resolveTenantFromDb } from './auth/clerk';
import { loadConfig } from './config';
import { createDb } from './db/client';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });

  const authenticate = createAuthenticator({
    verify: clerkVerify(config.CLERK_SECRET_KEY),
    resolveTenant: resolveTenantFromDb(db),
  });

  const app = buildApp({
    db,
    authenticate,
    pingRedis: async () => (await redis.ping()) === 'PONG',
    logger: true,
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
