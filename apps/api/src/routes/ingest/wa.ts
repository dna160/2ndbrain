/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/routes/ingest/wa.ts
 * Role    : POST /ingest/wa — relay receiver. Signature verified by the relay HMAC guard;
 *           delegates to IngestService (idempotent, blacklist-gated). Returns 200 always.
 * Exports : registerIngestRoutes()
 */
import { ingestResponseSchema } from '@recall/shared';
import type { FastifyInstance } from 'fastify';

import type { RelayGuard } from '../../middleware/relayHmac';
import type { IngestService } from '../../services/ingest.service';

export interface IngestRouteDeps {
  ingest: IngestService;
  relayGuard: RelayGuard;
  /** Resolve the tenant for an inbound relay (single-tenant v1). */
  resolveTenantId: () => Promise<string | null>;
}

export function registerIngestRoutes(app: FastifyInstance, deps: IngestRouteDeps): void {
  app.post('/ingest/wa', { preHandler: deps.relayGuard }, async (request, reply) => {
    const tenantId = await deps.resolveTenantId();
    if (!tenantId) return reply.code(503).send({ error: 'no tenant provisioned' });
    const result = await deps.ingest.ingestPayload(tenantId, request.body);
    return reply.code(200).send(ingestResponseSchema.parse(result));
  });
}
