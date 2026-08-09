/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/plaud/speaker.resolver.ts
 * Role    : Turn Plaud's opaque speaker LABELS ("Speaker 1") into meeting participants (docs/05
 *           §3.6). A recurring participant auto-resolves via a confirmed speaker_alias keyed by
 *           (deviceSerial, label); everyone else is left UNCONFIRMED for human confirmation —
 *           an unlabeled speaker is honest, a guessed one corrupts the graph. Also matches the
 *           recording to a calendar event (±15 min) so the meeting is linked and the operator
 *           has attendee context when confirming.
 * Exports : SpeakerResolver
 */
import { and, eq, gte, lte } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { calendarEvents, type MeetingParticipant, speakerAliases } from '../../db/schema';

const CAL_MATCH_WINDOW_MS = 15 * 60_000;

export class SpeakerResolver {
  constructor(private readonly db: Database) {}

  /** Distinct speaker labels → participants, auto-confirming any with a known alias. */
  async resolveParticipants(
    tenantId: string,
    deviceSerial: string | null,
    labels: string[],
  ): Promise<MeetingParticipant[]> {
    const aliases = deviceSerial
      ? await this.db
          .select({ speakerLabel: speakerAliases.speakerLabel, contactId: speakerAliases.contactId })
          .from(speakerAliases)
          .where(and(eq(speakerAliases.tenantId, tenantId), eq(speakerAliases.deviceSerial, deviceSerial)))
      : [];
    const byLabel = new Map(aliases.map((a) => [a.speakerLabel, a.contactId]));

    return labels.map((speakerKey) => {
      const entityId = byLabel.get(speakerKey);
      return entityId
        ? { speakerKey, entityId, confirmed: true, confidence: 1 }
        : { speakerKey, confirmed: false, confidence: 0 };
    });
  }

  /** Calendar event whose start is within ±15 min of the recording start, or null. */
  async matchCalendarEvent(tenantId: string, startAt: Date | null): Promise<string | null> {
    if (!startAt) return null;
    const lo = new Date(startAt.getTime() - CAL_MATCH_WINDOW_MS);
    const hi = new Date(startAt.getTime() + CAL_MATCH_WINDOW_MS);
    const [row] = await this.db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.tenantId, tenantId), gte(calendarEvents.startAt, lo), lte(calendarEvents.startAt, hi)))
      .limit(1);
    return row?.id ?? null;
  }
}

/** Distinct speaker labels from transcript segments, in first-appearance order. */
export function distinctSpeakers(segments: { speakerKey: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of segments) {
    if (!seen.has(s.speakerKey)) {
      seen.add(s.speakerKey);
      out.push(s.speakerKey);
    }
  }
  return out;
}
