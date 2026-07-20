/**
 * @CLAUDE_CONTEXT · /v1/digests — list, detail, re-send (docs/02 §5 Digests).
 */
import { digestOutputSchema } from '@recall/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { digests } from '../../db/schema';
import type { DigestService } from '../../services/digest.service';

export interface DigestRouteDeps {
  db: Database;
  digest: DigestService;
}

export function registerDigestRoutes(app: FastifyInstance, deps: DigestRouteDeps): void {
  app.get('/digests', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await deps.db
      .select({ id: digests.id, date: digests.date, deliveredVia: digests.deliveredVia })
      .from(digests)
      .where(eq(digests.tenantId, tenantId))
      .orderBy(desc(digests.date));
    return { items: rows };
  });

  app.get('/digests/:id', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    const [row] = await deps.db
      .select()
      .from(digests)
      .where(and(eq(digests.tenantId, tenantId), eq(digests.id, id)));
    if (!row) return reply.code(404).send({ error: 'digest not found' });
    return { id: row.id, date: row.date, deliveredVia: row.deliveredVia, content: digestOutputSchema.parse(row.content) };
  });

  app.post('/digests/:id/resend', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    try {
      const result = await deps.digest.resend(tenantId, id);
      return reply.code(200).send(result);
    } catch (err) {
      return reply.code(404).send({ error: err instanceof Error ? err.message : 'resend failed' });
    }
  });
}
