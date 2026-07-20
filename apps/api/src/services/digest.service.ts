/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/digest.service.ts
 * Role    : Nightly digest (docs/00 F5, docs/04 §5) — day's events + open tasks + tomorrow's
 *           calendar + memory context → DeepSeek digest JSON (every claim carries provenance)
 *           → persist → render WA text (WIB, ≤1600) → window-aware send → booking drafts.
 * Exports : DigestService, renderDigest
 */
import { digestOutputSchema, type DigestOutput } from '@recall/shared';
import { DIGEST_MAX_CHARS, DISPLAY_TZ } from '@recall/shared/constants';
import { and, eq, gte, lte } from 'drizzle-orm';

import type { Database } from '../db/client';
import { calendarEvents, digests, events, tasks } from '../db/schema';
import type { CalendarService } from './calendar.service';
import { parseStructured } from './llm/parse';
import { buildDigestUser, DIGEST_SYSTEM } from './llm/prompts';
import type { LlmClient } from './llm/types';
import type { RetrievalService } from './memory/retrieval.service';
import type { WaSendService } from './waSend.service';

function wibDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(d); // YYYY-MM-DD
}

/** Pure renderer: digest JSON → concise WA text, capped with a dashboard link. */
export function renderDigest(output: DigestOutput, date: string): string {
  const lines: string[] = [`Recall digest — ${date}`];
  const section = (title: string, items: Array<{ text: string }>) => {
    if (items.length === 0) return;
    lines.push('', title);
    for (const i of items) lines.push(`• ${i.text}`);
  };
  section('What happened', output.happened);
  section('My commitments', output.commitmentsByMe);
  section('Owed to me', output.commitmentsToMe);
  section('Conflicts', output.conflicts);
  if (output.recommendations.length > 0) {
    lines.push('', 'Recommended');
    for (const r of output.recommendations) lines.push(`• [${r.kind}] ${r.text}`);
  }
  const text = lines.join('\n');
  if (text.length <= DIGEST_MAX_CHARS) return text;
  return `${text.slice(0, DIGEST_MAX_CHARS - 40).trimEnd()}\n… full digest in dashboard`;
}

export interface DigestDeps {
  db: Database;
  llm: LlmClient;
  retrieval: Pick<RetrievalService, 'contextFor'>;
  waSend: Pick<WaSendService, 'send'>;
  calendar: Pick<CalendarService, 'createDraft'>;
  operatorWaId: string;
  now?: () => Date;
}

export class DigestService {
  private readonly now: () => Date;

  constructor(private readonly deps: DigestDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async run(tenantId: string): Promise<{ digestId: string; deliveredVia: 'freeform' | 'template' }> {
    const now = this.now();
    const dayStart = new Date(now.getTime() - 24 * 3600 * 1000);
    const tomorrowStart = new Date(now.getTime() + 12 * 3600 * 1000);
    const tomorrowEnd = new Date(now.getTime() + 36 * 3600 * 1000);

    const dayEvents = await this.deps.db
      .select({ id: events.id, content: events.content })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, dayStart)));
    const openTasks = await this.deps.db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.status, 'open')));
    const tomorrow = await this.deps.db
      .select({ id: calendarEvents.id, title: calendarEvents.title, startAt: calendarEvents.startAt })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenantId),
          gte(calendarEvents.startAt, tomorrowStart),
          lte(calendarEvents.startAt, tomorrowEnd),
        ),
      );
    const memoryContext = await this.deps.retrieval.contextFor(tenantId, {});

    const { data } = await parseStructured(this.deps.llm, {
      schema: digestOutputSchema,
      system: DIGEST_SYSTEM,
      user: buildDigestUser({
        events: dayEvents,
        tasks: openTasks,
        tomorrow: tomorrow.map((c) => ({ id: c.id, title: c.title, startAt: c.startAt.toISOString() })),
        memoryContext,
      }),
      model: 'deepseek-reasoner',
      temperature: 0.4,
    });

    const date = wibDate(now);
    const rows = await this.deps.db
      .insert(digests)
      .values({ tenantId, date, content: data, deliveredVia: 'none' })
      .onConflictDoUpdate({
        target: [digests.tenantId, digests.date],
        set: { content: data, updatedAt: now },
      })
      .returning({ id: digests.id });
    const digestId = rows[0]?.id;
    if (!digestId) throw new Error('digest: insert returned no id');

    const send = await this.deps.waSend.send(this.deps.operatorWaId, renderDigest(data, date));
    const deliveredVia = send.delivery === 'sent' ? 'freeform' : 'template';
    await this.deps.db
      .update(digests)
      .set({ deliveredVia, windowState: { windowOpen: send.windowOpen }, updatedAt: now })
      .where(eq(digests.id, digestId));

    // "recommend booking" → confirmable calendar draft (never auto-book).
    for (const rec of data.recommendations) {
      if (rec.kind === 'book' && rec.draftPayload) {
        await this.deps.calendar.createDraft(tenantId, {
          action: 'create',
          payload: {
            summary: rec.draftPayload.title,
            startISO: rec.draftPayload.startISO,
            endISO: rec.draftPayload.endISO,
            attendees: rec.draftPayload.attendees,
          },
          sourceType: 'digest',
          sourceId: digestId,
        });
      }
    }

    return { digestId, deliveredVia };
  }

  async resend(tenantId: string, digestId: string): Promise<{ deliveredVia: 'freeform' | 'template' }> {
    const [row] = await this.deps.db
      .select({ date: digests.date, content: digests.content })
      .from(digests)
      .where(and(eq(digests.tenantId, tenantId), eq(digests.id, digestId)));
    if (!row) throw new Error('digest not found');
    const output = digestOutputSchema.parse(row.content);
    const send = await this.deps.waSend.send(this.deps.operatorWaId, renderDigest(output, row.date));
    const deliveredVia = send.delivery === 'sent' ? 'freeform' : 'template';
    await this.deps.db
      .update(digests)
      .set({ deliveredVia, updatedAt: this.now() })
      .where(eq(digests.id, digestId));
    return { deliveredVia };
  }
}
