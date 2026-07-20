/**
 * @CLAUDE_CONTEXT · /v1/calendar — 7-day upcoming (with conflicts) + draft confirm/reject
 * (docs/02 §5 Upcoming). Confirm is the only path that writes to Google Calendar.
 */
import { calendarDraftDtoSchema, upcomingResponseSchema, type UpcomingEvent } from '@recall/shared';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { calendarDrafts, calendarEvents, type CalendarAttendee } from '../../db/schema';
import { detectConflicts, type CalendarService } from '../../services/calendar.service';

export interface CalendarRouteDeps {
  db: Database;
  calendar: CalendarService;
  now?: () => Date;
}

export function registerCalendarRoutes(app: FastifyInstance, deps: CalendarRouteDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get('/calendar/upcoming', async (request) => {
    const tenantId = request.auth!.tenantId;
    const from = now();
    const to = new Date(from.getTime() + 7 * 24 * 3600 * 1000);
    const rows = await deps.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.tenantId, tenantId),
          gte(calendarEvents.startAt, from),
          lte(calendarEvents.startAt, to),
        ),
      )
      .orderBy(asc(calendarEvents.startAt));

    const conflicts = detectConflicts(
      rows.map((e) => ({ id: e.id, title: e.title ?? '(untitled)', startAt: e.startAt, endAt: e.endAt })),
    );
    const eventsDto: UpcomingEvent[] = rows.map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      attendeeCount: (e.attendees as CalendarAttendee[]).length,
      conflictWith: conflicts.get(e.id) ?? null,
    }));

    const draftRows = await deps.db
      .select()
      .from(calendarDrafts)
      .where(and(eq(calendarDrafts.tenantId, tenantId), eq(calendarDrafts.status, 'proposed')));
    const drafts = draftRows.map((d) =>
      calendarDraftDtoSchema.parse({
        id: d.id,
        action: d.action,
        payload: d.payload,
        status: d.status,
        sourceType: d.sourceType,
      }),
    );

    return upcomingResponseSchema.parse({ events: eventsDto, drafts });
  });

  app.post('/calendar/drafts/:id/confirm', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    try {
      await deps.calendar.confirmDraft(tenantId, id);
      return reply.code(200).send({ confirmed: true });
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : 'confirm failed' });
    }
  });

  app.post('/calendar/drafts/:id/reject', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    await deps.calendar.rejectDraft(tenantId, id);
    return reply.code(200).send({ rejected: true });
  });
}
