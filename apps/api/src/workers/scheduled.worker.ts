/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/workers/scheduled.worker.ts
 * Role    : Repeatable cron jobs (deduped Lynkbot remove-then-add pattern) — calendar sync
 *           (15 min) and pre-meeting brief scan (10 min). (docs/01 §3.1, docs/03 Phase 5.)
 * Exports : createScheduledWorkers()
 */
import { QUEUES } from '@recall/shared/constants';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import type { Database } from '../db/client';
import { connectedAccounts, tenants } from '../db/schema';
import type { BriefsService } from '../services/briefs.service';
import type { CalendarService } from '../services/calendar.service';
import type { ConsolidationService } from '../services/memory/consolidation.service';
import { onFailedToDlq } from './dlq';

export interface ScheduledDeps {
  connection: Redis;
  db: Database;
  calendar: CalendarService;
  briefs: BriefsService;
  consolidation: ConsolidationService;
}

export async function createScheduledWorkers(deps: ScheduledDeps): Promise<Worker[]> {
  const calQueue = new Queue(QUEUES.calendarSync, { connection: deps.connection });
  await calQueue.add('sync', {}, { repeat: { every: 15 * 60_000 }, jobId: 'calendar-sync', removeOnComplete: 50 });
  const briefQueue = new Queue(QUEUES.briefs, { connection: deps.connection });
  await briefQueue.add('scan', {}, { repeat: { every: 10 * 60_000 }, jobId: 'briefs-scan', removeOnComplete: 50 });
  const consolidationQueue = new Queue(QUEUES.consolidation, { connection: deps.connection });
  // Nightly 20:30 WIB = 13:30 UTC (docs/03 Phase 6).
  await consolidationQueue.add('nightly', {}, { repeat: { pattern: '30 13 * * *' }, jobId: 'consolidation-nightly', removeOnComplete: 30 });

  const calWorker = new Worker(
    QUEUES.calendarSync,
    async () => {
      const accounts = await deps.db
        .select({ id: connectedAccounts.id, tenantId: connectedAccounts.tenantId })
        .from(connectedAccounts);
      for (const acc of accounts) await deps.calendar.sync(acc.tenantId, acc.id);
    },
    { connection: deps.connection },
  );
  calWorker.on('failed', onFailedToDlq(deps.db, QUEUES.calendarSync));

  const briefWorker = new Worker(
    QUEUES.briefs,
    async () => {
      const rows = await deps.db.select({ id: tenants.id }).from(tenants);
      for (const t of rows) await deps.briefs.scan(t.id);
    },
    { connection: deps.connection },
  );
  briefWorker.on('failed', onFailedToDlq(deps.db, QUEUES.briefs));

  const consolidationWorker = new Worker(
    QUEUES.consolidation,
    async () => {
      const rows = await deps.db.select({ id: tenants.id }).from(tenants);
      for (const t of rows) await deps.consolidation.consolidate(t.id);
    },
    { connection: deps.connection },
  );
  consolidationWorker.on('failed', onFailedToDlq(deps.db, QUEUES.consolidation));

  return [calWorker, briefWorker, consolidationWorker];
}
