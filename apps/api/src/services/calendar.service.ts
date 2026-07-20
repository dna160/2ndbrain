/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/calendar.service.ts
 * Role    : Calendar sync (incremental syncToken cursor) + overlap conflict detection +
 *           DRAFT-GATED writes. confirmDraft is the ONLY method that calls the Google client's
 *           insert/patch/remove — never auto-book (docs/00 F3, CLAUDE.md).
 * Exports : CalendarService, detectConflicts
 */
import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { calendarDrafts, calendarEvents, connectedAccounts } from '../db/schema';
import type { GCalEvent, GoogleCalendarClient } from './google/calendar.client';

export interface OverlapInput {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
}

/** Map eventId → the title of an event it overlaps with (docs/02 Upcoming conflicts). */
export function detectConflicts(events: OverlapInput[]): Map<string, string> {
  const conflicts = new Map<string, string>();
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!;
      const b = events[j]!;
      if (a.startAt < b.endAt && b.startAt < a.endAt) {
        conflicts.set(a.id, b.title);
        conflicts.set(b.id, a.title);
      }
    }
  }
  return conflicts;
}

function parseGcalTime(t?: { dateTime?: string; date?: string }): Date | null {
  const value = t?.dateTime ?? t?.date;
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface DraftPayload {
  summary?: string;
  startISO?: string;
  endISO?: string;
  attendees?: string[];
  gcalId?: string;
}

export interface CalendarDeps {
  db: Database;
  client: GoogleCalendarClient;
  now?: () => Date;
}

export class CalendarService {
  private readonly now: () => Date;

  constructor(private readonly deps: CalendarDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async sync(tenantId: string, accountId: string): Promise<{ upserted: number; reset: boolean }> {
    const [acc] = await this.deps.db
      .select({ syncCursor: connectedAccounts.syncCursor })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.id, accountId));

    let result = await this.deps.client.list(acc?.syncCursor ?? undefined);
    let reset = false;
    if (result.invalidToken) {
      reset = true;
      result = await this.deps.client.list(undefined); // full resync
    }

    for (const ev of result.events) await this.upsertEvent(tenantId, accountId, ev);

    if (result.nextSyncToken) {
      await this.deps.db
        .update(connectedAccounts)
        .set({ syncCursor: result.nextSyncToken, updatedAt: this.now() })
        .where(eq(connectedAccounts.id, accountId));
    }
    return { upserted: result.events.length, reset };
  }

  private async upsertEvent(tenantId: string, accountId: string, ev: GCalEvent): Promise<void> {
    const startAt = parseGcalTime(ev.start);
    const endAt = parseGcalTime(ev.end);
    if (!startAt || !endAt) return;
    const attendees = (ev.attendees ?? []).map((a) => ({
      email: a.email,
      name: a.displayName,
      responseStatus: a.responseStatus,
    }));
    const raw = ev as unknown as Record<string, unknown>;
    await this.deps.db
      .insert(calendarEvents)
      .values({ tenantId, gcalId: ev.id, accountId, title: ev.summary ?? null, startAt, endAt, attendees, raw })
      .onConflictDoUpdate({
        target: calendarEvents.gcalId,
        set: { title: ev.summary ?? null, startAt, endAt, attendees, raw, updatedAt: this.now() },
      });
  }

  async createDraft(
    tenantId: string,
    input: { action: 'create' | 'update' | 'cancel'; payload: DraftPayload; sourceType: 'digest' | 'meeting' | 'manual'; sourceId?: string },
  ): Promise<{ id: string }> {
    const rows = await this.deps.db
      .insert(calendarDrafts)
      .values({
        tenantId,
        action: input.action,
        payload: input.payload as unknown as Record<string, unknown>,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
      })
      .returning({ id: calendarDrafts.id });
    const id = rows[0]?.id;
    if (!id) throw new Error('createDraft: insert returned no id');
    return { id };
  }

  /** The ONLY path that mutates Google Calendar. */
  async confirmDraft(tenantId: string, draftId: string): Promise<{ applied: true }> {
    const [draft] = await this.deps.db
      .select()
      .from(calendarDrafts)
      .where(and(eq(calendarDrafts.tenantId, tenantId), eq(calendarDrafts.id, draftId)));
    if (!draft || draft.status !== 'proposed') throw new Error('draft not found or not proposed');

    const p = draft.payload as DraftPayload;
    if (draft.action === 'create') {
      await this.deps.client.insert({
        summary: p.summary ?? 'Untitled',
        startISO: p.startISO ?? this.now().toISOString(),
        endISO: p.endISO ?? this.now().toISOString(),
        attendees: p.attendees,
      });
    } else if (draft.action === 'update') {
      await this.deps.client.patch(p.gcalId ?? '', {
        summary: p.summary,
        startISO: p.startISO,
        endISO: p.endISO,
      });
    } else {
      await this.deps.client.remove(p.gcalId ?? '');
    }

    await this.deps.db
      .update(calendarDrafts)
      .set({ status: 'confirmed', appliedAt: this.now(), updatedAt: this.now() })
      .where(eq(calendarDrafts.id, draftId));
    return { applied: true };
  }

  async rejectDraft(tenantId: string, draftId: string): Promise<void> {
    await this.deps.db
      .update(calendarDrafts)
      .set({ status: 'rejected', updatedAt: this.now() })
      .where(and(eq(calendarDrafts.tenantId, tenantId), eq(calendarDrafts.id, draftId)));
  }
}
