/**
 * @CLAUDE_CONTEXT · /v1/pipeline — run history, live queue depths, best-effort retry
 * (docs/02 §5 Pipeline; docs/01 §7). Retry re-enqueues the earliest incomplete stage's job.
 */
import { QUEUES } from '@recall/shared/constants';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { events, pipelineRuns, transcripts } from '../../db/schema';
import type { Enqueuer, QueueStats } from '../../queues';

export interface PipelineRouteDeps {
  db: Database;
  queueStats: QueueStats;
  enqueuer: Pick<Enqueuer, 'enqueue'>;
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
      .select()
      .from(pipelineRuns)
      .where(and(eq(pipelineRuns.tenantId, tenantId), eq(pipelineRuns.id, id)));
    if (!run) return reply.code(404).send({ error: 'run not found' });
    if (run.refType !== 'event' || !run.refId) {
      return reply.code(409).send({ error: 'run is not automatically retryable' });
    }

    const eventId = run.refId;
    const [tr] = await deps.db
      .select({ id: transcripts.id })
      .from(transcripts)
      .where(eq(transcripts.eventId, eventId))
      .limit(1);

    if (tr) {
      await deps.enqueuer.enqueue(QUEUES.structuring, 'structuring.run', {
        tenantId,
        eventId,
        transcriptId: tr.id,
        runId: run.id,
      });
    } else {
      const [ev] = await deps.db
        .select({ mediaAssetId: events.mediaAssetId })
        .from(events)
        .where(eq(events.id, eventId));
      if (!ev?.mediaAssetId) return reply.code(409).send({ error: 'nothing to retry for this run' });
      await deps.enqueuer.enqueue(QUEUES.transcription, 'transcription.run', {
        tenantId,
        eventId,
        mediaAssetId: ev.mediaAssetId,
        runId: run.id,
      });
    }

    await deps.db
      .update(pipelineRuns)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(pipelineRuns.id, run.id));
    return reply.code(200).send({ retried: true });
  });
}
