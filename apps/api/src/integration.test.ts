/**
 * Phase 1 acceptance, end-to-end against a real pgvector Postgres (testcontainers):
 *  - migration 0000 applies (incl. CREATE EXTENSION vector + ivfflat index),
 *  - PipelineService persists ordered stages + metered cost, failure marks the run failed,
 *  - /v1 routes round-trip tenantId and reject unauthenticated requests (401).
 *
 * Skips automatically when no Docker daemon is reachable so `pnpm test` still runs elsewhere;
 * the coverage gate is met by the unit tests regardless.
 */
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';

import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from './app';
import { createAuthenticator } from './auth/authenticator';
import { resolveTenantFromDb } from './auth/clerk';
import { createDb, type DbHandle } from './db/client';
import { runMigrations } from './db/migrate';
import { makeRelayHmacGuard } from './middleware/relayHmac';
import { events, pipelineRuns } from './db/schema';
import { seed } from './db/seed';
import { IngestService } from './services/ingest.service';
import { PipelineService } from './services/pipeline.service';

const RELAY_SECRET = 'relay-secret-at-least-16';
const RELAY_NOW = 1_700_000_000_000;

const dockerAvailable =
  !!process.env.DOCKER_HOST ||
  existsSync('/var/run/docker.sock') ||
  existsSync(`${process.env.HOME}/.docker/run/docker.sock`);

const MIGRATIONS_DIR = new URL('../drizzle', import.meta.url).pathname;

describe.skipIf(!dockerAvailable)('Phase 1 integration', () => {
  let container: StartedTestContainer;
  let handle: DbHandle;
  let tenantId: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    container = await new GenericContainer('pgvector/pgvector:pg16')
      .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'recall_test' })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .start();

    const url = `postgres://test:test@${container.getHost()}:${container.getMappedPort(5432)}/recall_test`;
    await runMigrations(url, MIGRATIONS_DIR);
    ({ tenantId } = await seed(url, {
      tenantName: 'Test Tenant',
      clerkUserId: 'user_seed_operator',
      operatorWaId: '000000000000',
    }));

    handle = createDb(url, { max: 2 });
    const authenticate = createAuthenticator({
      verify: async (t) => (t === 'good' ? { sub: 'user_seed_operator' } : null),
      resolveTenant: resolveTenantFromDb(handle.db),
    });
    const enqueue = vi.fn(async () => undefined);
    app = buildApp({
      db: handle.db,
      authenticate,
      pingRedis: async () => true,
      ingestion: {
        ingest: new IngestService({
          db: handle.db,
          enqueuer: { enqueue },
          pipeline: new PipelineService(handle.db),
        }),
        relayGuard: makeRelayHmacGuard({
          secret: RELAY_SECRET,
          maxSkewMs: 300_000,
          now: () => RELAY_NOW,
        }),
        resolveTenantId: async () => tenantId,
        r2: { presignPut: async () => 'https://r2.example/put' },
        enqueuer: { enqueue },
        pipeline: new PipelineService(handle.db),
        internalApiKey: 'test-internal-key-123',
      },
    });
    await app.ready();
  });

  function postRelay(body: unknown) {
    const raw = JSON.stringify(body);
    const signature = createHmac('sha256', RELAY_SECRET).update(`${RELAY_NOW}.${raw}`).digest('hex');
    return app.inject({
      method: 'POST',
      url: '/ingest/wa',
      headers: {
        'content-type': 'application/json',
        'x-relay-timestamp': String(RELAY_NOW),
        'x-relay-signature': signature,
      },
      payload: raw,
    });
  }

  function relayTextBody(waId: string, msgId: string) {
    return {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'PN' },
                messages: [
                  { id: msgId, from: waId, type: 'text', timestamp: '1700000000', text: { body: 'hai' } },
                ],
              },
            },
          ],
        },
      ],
    };
  }

  afterAll(async () => {
    await app?.close();
    await handle?.sql.end();
    await container?.stop();
  });

  it('records ordered stages and metered cost for a successful run', async () => {
    const svc = new PipelineService(handle.db);
    const runId = await svc.startRun({ tenantId, jobType: 'media', refType: 'event' });
    await svc.stage(runId, 'ingested', async () => undefined);
    await svc.stage(runId, 'media_stored', async () => undefined);
    await svc.meterCost(runId, { sttSeconds: 30 });
    await svc.completeRun(runId);

    const [row] = await handle.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    expect(row?.status).toBe('done');
    expect(row?.stages.map((s) => s.stage)).toEqual(['ingested', 'media_stored']);
    expect(row?.stages.every((s) => s.ok)).toBe(true);
    expect(row?.costIdr).toBe(15); // 30s * 0.5 IDR/s
  });

  it('marks a run failed when a stage throws', async () => {
    const svc = new PipelineService(handle.db);
    const runId = await svc.startRun({ tenantId, jobType: 'transcription' });
    await expect(
      svc.stage(runId, 'transcribed', async () => {
        throw new Error('stt down');
      }),
    ).rejects.toThrow('stt down');

    const [row] = await handle.db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId));
    expect(row?.status).toBe('failed');
    expect(row?.stages[0]).toMatchObject({ stage: 'transcribed', ok: false, err: 'stt down' });
    expect(row?.error).toMatchObject({ stage: 'transcribed' });
  });

  it('serves health, rejects unauthenticated /v1, and round-trips tenantId', async () => {
    const health = await app.inject({ method: 'GET', url: '/internal/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok', db: true, redis: true });

    const unauth = await app.inject({ method: 'GET', url: '/v1/settings/contacts' });
    expect(unauth.statusCode).toBe(401);

    const auth = { authorization: 'Bearer good' };
    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/settings/blacklist',
      headers: auth,
      payload: { waId: '628999' },
    });
    expect(blocked.statusCode).toBe(201);
    expect(blocked.json()).toMatchObject({ waId: '628999', blocked: true });

    const list = await app.inject({ method: 'GET', url: '/v1/settings/blacklist', headers: auth });
    const listBody = list.json<{ items: Array<{ waId: string }> }>();
    expect(listBody.items.map((c) => c.waId)).toContain('628999');

    // the seeded operator contact belongs to this tenant — proves tenant-scoped reads
    const contacts = await app.inject({ method: 'GET', url: '/v1/settings/contacts', headers: auth });
    const contactsBody = contacts.json<{ items: Array<{ label: string | null }> }>();
    expect(contactsBody.items.some((c) => c.label === 'Operator')).toBe(true);
  });

  // ── Phase 2 acceptance ──────────────────────────────────────────────────────
  it('ingests a relayed message idempotently — replay yields no new rows', async () => {
    const first = await postRelay(relayTextBody('628int', 'wamid.INT1'));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ persisted: 1, duplicates: 0 });

    const second = await postRelay(relayTextBody('628int', 'wamid.INT1'));
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ persisted: 0, duplicates: 1 });

    const rows = await handle.db.select().from(events).where(eq(events.externalId, 'wamid.INT1'));
    expect(rows).toHaveLength(1);
  });

  it('rejects an unsigned relay POST', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ingest/wa',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(401);
  });

  it('drops blacklisted senders at ingest — zero event rows', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/settings/blacklist',
      headers: { authorization: 'Bearer good' },
      payload: { waId: '628blocked' },
    });
    const res = await postRelay(relayTextBody('628blocked', 'wamid.BLK1'));
    expect(res.json()).toMatchObject({ dropped: 1, persisted: 0 });

    const rows = await handle.db.select().from(events).where(eq(events.externalId, 'wamid.BLK1'));
    expect(rows).toHaveLength(0);
  });

  it('exposes the DLQ behind the internal API key', async () => {
    const unauth = await app.inject({ method: 'GET', url: '/internal/dlq' });
    expect(unauth.statusCode).toBe(401);
    const ok = await app.inject({
      method: 'GET',
      url: '/internal/dlq',
      headers: { 'x-internal-api-key': 'test-internal-key-123' },
    });
    expect(ok.statusCode).toBe(200);
  });
});
