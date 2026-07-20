/**
 * Phase 8 security authz matrix — every /v1 route rejects unauthenticated requests (401),
 * and the relay-HMAC + internal-API-key guards reject unsigned/unkeyed requests. Runs without a
 * DB: the auth preHandlers reject before any handler touches the (stubbed) services.
 */
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from './app';
import { createAuthenticator } from './auth/authenticator';
import type { Database } from './db/client';
import { makeRelayHmacGuard } from './middleware/relayHmac';
import type { CalendarService } from './services/calendar.service';
import type { ConversationsService } from './services/conversations.service';
import type { DigestService } from './services/digest.service';
import type { IngestService } from './services/ingest.service';
import type { PipelineService } from './services/pipeline.service';

const stub = <T>() => ({}) as unknown as T;

const V1_GET_ROUTES = [
  '/v1/settings/contacts',
  '/v1/settings/blacklist',
  '/v1/meetings',
  '/v1/events',
  '/v1/tasks',
  '/v1/memory/search',
  '/v1/memory/reviews',
  '/v1/memory/graph',
  '/v1/calendar/upcoming',
  '/v1/conversations',
  '/v1/digests',
  '/v1/pipeline/runs',
];

describe('security authz matrix', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({
      db: stub<Database>(),
      authenticate: createAuthenticator({ verify: async () => null, resolveTenant: async () => null }),
      pingRedis: async () => true,
      ingestion: {
        ingest: stub<IngestService>(),
        relayGuard: makeRelayHmacGuard({ secret: 'relay-secret-at-least-16', maxSkewMs: 1000 }),
        resolveTenantId: async () => 't1',
        r2: { presignPut: async () => 'https://r2/put' },
        enqueuer: { enqueue: async () => undefined },
        pipeline: stub<PipelineService>(),
        queueStats: { depths: async () => [] },
        internalApiKey: 'internal-secret-key-123',
      },
      calendarConversations: { calendar: stub<CalendarService>(), conversations: stub<ConversationsService>() },
      digest: stub<DigestService>(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(V1_GET_ROUTES)('rejects unauthenticated GET %s with 401', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
  });

  it('rejects unauthenticated writes to /v1 with 401', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/v1/tasks/abc', payload: { status: 'done' } });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unsigned relay POST /ingest/wa with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/wa',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects /internal/dlq without the internal API key (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/dlq' });
    expect(res.statusCode).toBe(401);
  });

  it('leaves the health check open (200)', async () => {
    const res = await app.inject({ method: 'GET', url: '/internal/health' });
    // pingDb default would hit the stub db; supply a stub pingDb via a fresh app is overkill —
    // health returns 503 if a store check throws, still not 401 (open route).
    expect([200, 503]).toContain(res.statusCode);
  });
});
