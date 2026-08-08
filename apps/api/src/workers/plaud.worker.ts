/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/workers/plaud.worker.ts
 * Role    : BullMQ consumer for `recall-plaud-sync` (docs/05 §5). Runs one PlaudImportService
 *           sync pass per tenant. Single-flight per tenant via a Redis lock so overlapping base +
 *           adaptive triggers never double-ingest. Failures route to the DLQ.
 * Exports : createPlaudWorker
 */
import { QUEUES } from '@recall/shared/constants';
import { Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import type { Database } from '../db/client';
import { tenants } from '../db/schema';
import type { PlaudImportService } from '../services/plaud/plaud.import.service';
import { onFailedToDlq } from './dlq';

export interface PlaudWorkerDeps {
  connection: Redis;
  db: Database;
  imports: PlaudImportService;
  concurrency?: number;
}

/** 5-minute single-flight lock: a base poll and a calendar burst must not run a tenant twice. */
async function withTenantLock(connection: Redis, tenantId: string, fn: () => Promise<void>): Promise<void> {
  const key = `lock:plaud-sync:${tenantId}`;
  const got = await connection.set(key, '1', 'EX', 300, 'NX');
  if (got !== 'OK') return; // another run holds it; this trigger is redundant
  try {
    await fn();
  } finally {
    await connection.del(key);
  }
}

export function createPlaudWorker(deps: PlaudWorkerDeps): Worker {
  const worker = new Worker(
    QUEUES.plaudSync,
    async (job) => {
      // A job may target one tenant (adaptive/manual) or all (base poll).
      const targetTenantId = (job.data as { tenantId?: string }).tenantId;
      const rows = targetTenantId
        ? [{ id: targetTenantId }]
        : await deps.db.select({ id: tenants.id }).from(tenants);
      for (const t of rows) {
        await withTenantLock(deps.connection, t.id, async () => {
          const r = await deps.imports.sync(t.id);
          console.log(
            `[plaud] tenant ${t.id}: discovered=${r.discovered} advanced=${r.advanced} imported=${r.imported} stalled=${r.stalled}`,
          );
        });
      }
    },
    { connection: deps.connection, concurrency: deps.concurrency ?? 1 },
  );
  worker.on('failed', onFailedToDlq(deps.db, QUEUES.plaudSync));
  return worker;
}

/** Used by the calendar path to check a tenant exists before scheduling adaptive syncs. */
export async function tenantExists(db: Database, tenantId: string): Promise<boolean> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return Boolean(row);
}
