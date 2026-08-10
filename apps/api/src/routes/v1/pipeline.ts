/**
 * @CLAUDE_CONTEXT · /v1/pipeline — run history, live queue depths, best-effort retry
 * (docs/02 §5 Pipeline; docs/01 §7). Retry re-enqueues the earliest incomplete stage's job.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { pipelineRuns } from '../../db/schema';
import type { QueueStats } from '../../queues';

export interface PipelineRouteDeps {
  db: Database;
  queueStats: QueueStats;
}

export function registerPipelineRoutes(app: FastifyInstance, deps: PipelineRouteDeps): void {
  app.get('/pipeline/runs', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await deps.db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.tenantId, tenantId))
      .orderBy(desc(pipelineRuns.createdAt))
      .limit(100);
    return {
      items: rows.map((r) => ({
        id: r.id,
        jobType: r.jobType,
        refType: r.refType,
        refId: r.refId,
        status: r.status,
        stages: r.stages,
        costIdr: r.costIdr,
        attempts: r.attempts,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.get('/pipeline/queues', async () => {
    return { items: await deps.queueStats.depths() };
  });

  app.post('/pipeline/runs/:id/retry', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    const [run] = await deps.db
      .select({ id: pipelineRuns.id })
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.tenantId, tenantId), eq(pipelineRuns.id, id)));
    if (!run) return reply.code(404).send({ error: 'run not found' });
    // Auto-retry re-ran the STT/structuring stages, which no longer exist (Plaud is the system
    // of record). Nothing is automatically retryable; re-trigger a Plaud sync via the operator
    // command or the internal endpoint instead.
    return reply.code(409).send({ error: 'automatic retry is no longer supported' });
  });
}
