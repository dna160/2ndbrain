/** Calendar contracts (docs/00 F3, docs/02 §5 Upcoming). All GCal writes are draft-gated. */
import { z } from 'zod';

export const upcomingEventSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  attendeeCount: z.number().int().nonnegative(),
  /** title of an overlapping event, or null. */
  conflictWith: z.string().nullable(),
});
export type UpcomingEvent = z.infer<typeof upcomingEventSchema>;

export const calendarDraftDtoSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['create', 'update', 'cancel']),
  payload: z.record(z.unknown()),
  status: z.enum(['proposed', 'confirmed', 'rejected']),
  sourceType: z.enum(['digest', 'meeting', 'manual']),
});
export type CalendarDraftDto = z.infer<typeof calendarDraftDtoSchema>;

export const upcomingResponseSchema = z.object({
  events: z.array(upcomingEventSchema),
  drafts: z.array(calendarDraftDtoSchema),
});
export type UpcomingResponse = z.infer<typeof upcomingResponseSchema>;
