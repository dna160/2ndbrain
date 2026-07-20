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
import { onFailedToDlq } from './dlq';

export interface ScheduledDeps {
  connection: Redis;
  db: Database;
  calendar: CalendarService;
  briefs: BriefsService;
}

export async function createScheduledWorkers(deps: ScheduledDeps): Promise<Worker[]> {
  const calQueue = new Queue(QUEUES.calendarSync, { connection: deps.connection });
  await calQueue.add('sync', {}, { repeat: { every: 15 * 60_000 }, jobId: 'calendar-sync', removeOnComplete: 50 });
  const briefQueue = new Queue(QUEUES.briefs, { connection: deps.connection });
  await briefQueue.add('scan', {}, { repeat: { every: 10 * 60_000 }, jobId: 'briefs-scan', removeOnComplete: 50 });

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

  return [calWorker, briefWorker];
}
