/**
 * @CLAUDE_CONTEXT · GET /v1/events — recent substrate events for the Today timeline (docs/02 §5).
 */
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { events } from '../../db/schema';

export function registerEventRoutes(app: FastifyInstance, db: Database): void {
  app.get('/events', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await db
      .select()
      .from(events)
      .where(eq(events.tenantId, tenantId))
      .orderBy(desc(events.occurredAt))
      .limit(200);
    return {
      items: rows.map((e) => ({
        id: e.id,
        source: e.source,
        type: e.type,
        direction: e.direction,
        senderWaId: e.senderWaId,
        content: e.content,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  });
}
