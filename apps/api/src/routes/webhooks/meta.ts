/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/routes/webhooks/meta.ts
 * Role    : Recall's direct WhatsApp Cloud API webhook — replaces the old Lynkbot relay
 *           (POST /ingest/wa). Adapted from Lynkbot apps/api/src/routes/webhooks/meta.ts.
 *             GET  — Meta's subscription handshake: echo hub.challenge when the token matches.
 *             POST — signature-verified ingest; delegates to IngestService (idempotent,
 *                    blacklist-gated) and always answers 200 so Meta stops retrying.
 * Exports : registerMetaWebhookRoutes()
 */
import { ingestResponseSchema } from '@recall/shared';
import type { FastifyInstance } from 'fastify';

import type { MetaSignatureGuard } from '../../middleware/metaSignature';
import type { IngestService } from '../../services/ingest.service';

export interface MetaWebhookDeps {
  ingest: IngestService;
  metaGuard: MetaSignatureGuard;
  /** Token Meta echoes during the GET handshake (META_WEBHOOK_VERIFY_TOKEN). */
  verifyToken: string;
  /** Resolve the tenant for an inbound message (single-tenant v1). */
  resolveTenantId: () => Promise<string | null>;
}

interface HubQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

export function registerMetaWebhookRoutes(app: FastifyInstance, deps: MetaWebhookDeps): void {
  // Meta calls this once when you save the callback URL in the App dashboard. It must reply
  // with the raw challenge as text/plain — a JSON-wrapped value fails verification.
  app.get('/webhooks/meta', async (request, reply) => {
    const q = request.query as HubQuery;
    if (q['hub.mode'] === 'subscribe' && q['hub.verify_token'] === deps.verifyToken) {
      return reply.code(200).type('text/plain').send(q['hub.challenge'] ?? '');
    }
    return reply.code(403).send({ error: 'verification failed' });
  });

  app.post('/webhooks/meta', { preHandler: deps.metaGuard }, async (request, reply) => {
    const tenantId = await deps.resolveTenantId();
    if (!tenantId) return reply.code(503).send({ error: 'no tenant provisioned' });
    const result = await deps.ingest.ingestPayload(tenantId, request.body);
    return reply.code(200).send(ingestResponseSchema.parse(result));
  });
}
