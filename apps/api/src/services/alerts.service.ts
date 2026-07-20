/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/alerts.service.ts
 * Role    : Operational alerts (docs/03 Phase 8) — DLQ depth > 0 → WhatsApp notification to the
 *           operator so no failure stays silent (docs/00 NFR reliability).
 * Exports : AlertsService
 */
import { count, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { dlq } from '../db/schema';
import type { WaSendService } from './waSend.service';

export interface AlertsDeps {
  db: Database;
  waSend: Pick<WaSendService, 'send'>;
  operatorWaId: string;
}

export class AlertsService {
  constructor(private readonly deps: AlertsDeps) {}

  async checkDlq(tenantId: string): Promise<{ count: number; alerted: boolean }> {
    const [row] = await this.deps.db
      .select({ n: count() })
      .from(dlq)
      .where(eq(dlq.tenantId, tenantId));
    const n = Number(row?.n ?? 0);
    if (n > 0) {
      await this.deps.waSend.send(
        this.deps.operatorWaId,
        `Recall alert: ${n} job(s) in the dead-letter queue. Check the Pipeline view.`,
      );
      return { count: n, alerted: true };
    }
    return { count: n, alerted: false };
  }
}
