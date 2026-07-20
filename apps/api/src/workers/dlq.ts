/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/workers/dlq.ts
 * Role    : Shared BullMQ 'failed' handler — on retry-exhaustion, write a durable dlq row
 *           (docs/03 Phase 2 QC gate). Used by every worker.
 * Exports : onFailedToDlq()
 */
import type { Job } from 'bullmq';

import type { Database } from '../db/client';
import { dlq } from '../db/schema';

export function onFailedToDlq(db: Database, queue: string) {
  return async (job: Job<{ tenantId: string }> | undefined, err: Error): Promise<void> => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      await db.insert(dlq).values({
        tenantId: job.data.tenantId,
        queue,
        jobId: job.id ?? null,
        payload: job.data as unknown as Record<string, unknown>,
        error: { message: err.message },
      });
    }
  };
}
