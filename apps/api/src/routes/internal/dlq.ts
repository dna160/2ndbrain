/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/routes/internal/dlq.ts
 * Role    : GET /internal/dlq — durable dead-letter visibility (docs/03 Phase 2 QC gate).
 *           Reads the dlq table (rows written by workers on retry-exhaustion). Guarded by
 *           the internal API key. Deduped from Lynkbot routes/internal/dlq.ts.
 * Exports : registerDlqRoutes()
 */
import { desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { dlq } from '../../db/schema';
import { makeInternalApiKeyGuard } from '../../middleware/internalApiKey';

export interface DlqRouteDeps {
  db: Database;
  internalApiKey: string;
}

export function registerDlqRoutes(app: FastifyInstance, deps: DlqRouteDeps): void {
  const guard = makeInternalApiKeyGuard(deps.internalApiKey);

  app.get('/internal/dlq', { preHandler: guard }, async () => {
    const rows = await deps.db.select().from(dlq).orderBy(desc(dlq.failedAt)).limit(100);
    return { items: rows };
  });
}
