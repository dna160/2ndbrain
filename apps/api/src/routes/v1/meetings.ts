/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/routes/v1/meetings.ts
 * Role    : Meetings API (docs/01 §7) — list, detail, and speaker confirm. Tenant-scoped.
 * Exports : registerMeetingRoutes()
 */
import {
  confirmParticipantRequestSchema,
  meetingDetailSchema,
  meetingListItemSchema,
  type MeetingDetail,
} from '@recall/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { meetings, transcripts, type TranscriptSegment } from '../../db/schema';
import type { SpeakerService } from '../../services/speaker.service';

export interface MeetingRouteDeps {
  db: Database;
  speaker: SpeakerService;
}

type MeetingRow = typeof meetings.$inferSelect;

function toDetail(m: MeetingRow, segments: TranscriptSegment[]): MeetingDetail {
  return {
    id: m.id,
    title: m.title,
    occurredAt: m.occurredAt.toISOString(),
    durationSec: m.durationSec,
    participantCount: m.participants.length,
    attributionConfidence: m.attributionConfidence,
    transcriptId: m.transcriptId,
    participants: m.participants.map((p) => ({
      speakerKey: p.speakerKey,
      entityId: p.entityId ?? null,
      suggestedName: p.suggestedName ?? null,
      confirmed: p.confirmed,
      confidence: p.confidence,
    })),
    topics: m.topics,
    summary: m.summary,
    decisions: m.decisions,
    openQuestions: m.openQuestions,
    recommendations: m.recommendations.map((r) => ({
      speakerKey: r.speakerKey,
      entityId: r.entityId ?? null,
      advice: r.advice,
    })),
    segments: segments.map((s) => ({
      startMs: s.startMs,
      endMs: s.endMs,
      speakerKey: s.speakerKey,
      text: s.text,
    })),
  };
}

export function registerMeetingRoutes(app: FastifyInstance, deps: MeetingRouteDeps): void {
  app.get('/meetings', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await deps.db
      .select()
      .from(meetings)
      .where(eq(meetings.tenantId, tenantId))
      .orderBy(desc(meetings.occurredAt));
    return {
      items: rows.map((m) =>
        meetingListItemSchema.parse({
          id: m.id,
          title: m.title,
          occurredAt: m.occurredAt.toISOString(),
          durationSec: m.durationSec,
          participantCount: m.participants.length,
          attributionConfidence: m.attributionConfidence,
        }),
      ),
    };
  });

  app.get('/meetings/:id', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    const [m] = await deps.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.tenantId, tenantId), eq(meetings.id, id)));
    if (!m) return reply.code(404).send({ error: 'meeting not found' });
    const [t] = await deps.db
      .select({ segments: transcripts.segments })
      .from(transcripts)
      .where(eq(transcripts.id, m.transcriptId));
    return meetingDetailSchema.parse(toDetail(m, t?.segments ?? []));
  });

  app.post('/meetings/:id/participants/:speakerKey/confirm', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id, speakerKey } = request.params as { id: string; speakerKey: string };
    const parsed = confirmParticipantRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const result = await deps.speaker.confirm(tenantId, id, speakerKey, parsed.data);
    return reply.code(200).send(result);
  });
}
