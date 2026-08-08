/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/routes/internal/plaud.ts
 * Role    : POST /internal/plaud/sync — manual trigger for a Plaud sync pass (docs/05 §12.3
 *           "manual" row). Enqueues a `sync` job onto recall-plaud-sync; the worker does the
 *           work. Guarded by the internal API key. This is the operator override before the
 *           WhatsApp `sync now` command (Phase 3c) exists.
 * Exports : registerPlaudInternalRoutes()
 */
import { QUEUES } from '@recall/shared/constants';
import type { FastifyInstance } from 'fastify';

import { makeInternalApiKeyGuard } from '../../middleware/internalApiKey';
import type { Enqueuer } from '../../queues';

export interface PlaudInternalDeps {
  enqueuer: Pick<Enqueuer, 'enqueue'>;
  internalApiKey: string;
}

export function registerPlaudInternalRoutes(app: FastifyInstance, deps: PlaudInternalDeps): void {
  const guard = makeInternalApiKeyGuard(deps.internalApiKey);

  app.post('/internal/plaud/sync', { preHandler: guard }, async (request, reply) => {
    const tenantId = (request.body as { tenantId?: string } | undefined)?.tenantId;
    // No tenantId → base-poll semantics (all tenants). With one → just that tenant.
    await deps.enqueuer.enqueue(QUEUES.plaudSync, 'sync', tenantId ? { tenantId } : {});
    return reply.code(202).send({ enqueued: true });
  });
}
