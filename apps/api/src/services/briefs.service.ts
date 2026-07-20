/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/briefs.service.ts
 * Role    : Pre-meeting briefs (docs/00 F6). Scan for events starting in 55-65 min with
 *           attendees and no briefSentAt → build a ≤900-char brief → WA push → set briefSentAt.
 *           Memory retrieval is a Phase 6 hook (no-op now).
 * Exports : BriefsService
 */
import { BRIEF_MAX_CHARS } from '@recall/shared/constants';
import { and, eq, gte, isNull, lte } from 'drizzle-orm';

import type { Database } from '../db/client';
import { calendarEvents, type CalendarAttendee } from '../db/schema';
import { BRIEF_SYSTEM } from './llm/prompts';
import type { LlmClient } from './llm/types';
import type { WaSendService } from './waSend.service';

export interface BriefsDeps {
  db: Database;
  llm: LlmClient;
  waSend: Pick<WaSendService, 'send'>;
  operatorWaId: string;
  retrieval?: (tenantId: string, eventId: string) => Promise<string | undefined>;
  now?: () => Date;
}

export class BriefsService {
  private readonly now: () => Date;

  constructor(private readonly deps: BriefsDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async scan(tenantId: string): Promise<{ sent: number }> {
    const now = this.now();
    const lo = new Date(now.getTime() + 55 * 60_000);
    const hi = new Date(now.getTime() + 65 * 60_000);
    const upcoming = await this.deps.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenantId),
          gte(calendarEvents.startAt, lo),
          lte(calendarEvents.startAt, hi),
          isNull(calendarEvents.briefSentAt),
        ),
      );

    let sent = 0;
    for (const ev of upcoming) {
      const attendees = ev.attendees as CalendarAttendee[];
      if (attendees.length === 0) continue;
      const context = await this.deps.retrieval?.(tenantId, ev.id);
      const brief = await this.buildBrief(ev.title ?? 'Meeting', attendees, context);
      await this.deps.waSend.send(this.deps.operatorWaId, brief);
      await this.deps.db
        .update(calendarEvents)
        .set({ briefSentAt: now, updatedAt: now })
        .where(eq(calendarEvents.id, ev.id));
      sent++;
    }
    return { sent };
  }

  private async buildBrief(
    title: string,
    attendees: CalendarAttendee[],
    context: string | undefined,
  ): Promise<string> {
    const res = await this.deps.llm.chat(
      [
        { role: 'system', content: BRIEF_SYSTEM },
        {
          role: 'user',
          content: `MEETING: ${title}\nATTENDEES: ${attendees.map((a) => a.name ?? a.email).join(', ')}\nMEMORY CONTEXT: ${context ?? 'none'}`,
        },
      ],
      { model: 'deepseek-reasoner', temperature: 0.4 },
    );
    return res.content.slice(0, BRIEF_MAX_CHARS);
  }
}
