/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/plaud/plaud.import.service.ts
 * Role    : Drives the Plaud readiness state machine (docs/05 §3.4) and imports ready recordings
 *           into the substrate: an `events` row (source='plaud', idempotent on externalId), a
 *           `transcripts` row (sttProvider/diarizationMode='plaud'), and transcript+notes mirrored
 *           to R2 (audio is NOT mirrored — §12.2). Every import is wrapped in a pipeline_runs run
 *           so cost queries stay total (Plaud is a flat subscription → costIdr 0). Speaker→contact
 *           resolution (3c), meeting-row + recommendation pass (3c/3d) come later; this phase
 *           establishes the connection and lands transcript + memory-ready content.
 * Exports : PlaudImportService, PlaudImportDeps
 */
import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { events, meetings, plaudRecordings, tasks, transcripts, type TranscriptSegment } from '../../db/schema';
import type { PlaudFileDetail } from '@recall/shared';
import type { PipelineService } from '../pipeline.service';
import type { R2Client } from '../r2.service';
import { type PlaudClient, PlaudSchemaError, toTranscriptSegments } from './plaud.client';
import { distinctSpeakers, type SpeakerResolver } from './speaker.resolver';
import { plaudActionItems, plaudIsReady, plaudNotesMarkdown } from '@recall/shared';

export interface PlaudImportDeps {
  db: Database;
  plaud: PlaudClient;
  r2: Pick<R2Client, 'put'>;
  pipeline: Pick<PipelineService, 'startRun' | 'stage' | 'completeRun'>;
  speakers: SpeakerResolver;
  stallHours: number;
  now?: () => Date;
  /** Emitted once when a recording crosses the stall threshold (wired to WA alerts in 3c). */
  onStalled?: (tenantId: string, recording: { plaudId: string; name: string }) => void;
}

export interface SyncResult {
  discovered: number;
  advanced: number;
  imported: number;
  stalled: number;
}

export class PlaudImportService {
  private readonly now: () => Date;
  constructor(private readonly deps: PlaudImportDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** One sync pass: discover new files, then advance every non-terminal recording. */
  async sync(tenantId: string): Promise<SyncResult> {
    const result: SyncResult = { discovered: 0, advanced: 0, imported: 0, stalled: 0 };

    const { files } = await this.deps.plaud.listFiles({ pageSize: 50 });
    for (const f of files) {
      const created = await this.discover(tenantId, f);
      if (created) result.discovered++;
    }

    const pending = await this.deps.db
      .select()
      .from(plaudRecordings)
      .where(and(eq(plaudRecordings.tenantId, tenantId)));

    for (const rec of pending) {
      if (rec.readiness === 'superseded') continue;
      // Fully done = ingested AND has a meeting. An ingested row without a meeting is re-checked
      // so advance() can backfill the missing meeting (pre-3c imports).
      if (rec.readiness === 'ingested' && rec.meetingId) continue;
      const outcome = await this.advance(tenantId, rec.plaudId);
      if (outcome === 'imported') result.imported++;
      else if (outcome === 'stalled') result.stalled++;
      else if (outcome === 'advanced') result.advanced++;
    }

    // Self-heal: meetings imported before action-item extraction existed have a summary but no
    // tasks. Backfill from the stored summary (no Plaud call needed). createTasks is idempotent.
    await this.backfillMeetingTasks(tenantId);
    return result;
  }

  /** Insert a `discovered` row if unseen. Idempotent on (tenantId, plaudId). Returns true if new. */
  private async discover(
    tenantId: string,
    f: { id: string; name: string; start_at: string; duration: number; serial_number?: string | null },
  ): Promise<boolean> {
    const rows = await this.deps.db
      .insert(plaudRecordings)
      .values({
        tenantId,
        plaudId: f.id,
        name: f.name,
        startAt: this.parseDate(f.start_at),
        durationMs: f.duration,
        serialNumber: f.serial_number ?? null,
        readiness: 'discovered',
      })
      .onConflictDoNothing({ target: [plaudRecordings.tenantId, plaudRecordings.plaudId] })
      .returning({ id: plaudRecordings.id });
    return rows.length > 0;
  }

  /** Advance one recording through the state machine. Safe to re-run. */
  private async advance(
    tenantId: string,
    plaudId: string,
  ): Promise<'advanced' | 'imported' | 'stalled' | 'noop'> {
    let detail;
    try {
      detail = await this.deps.plaud.getFile(plaudId);
    } catch (err) {
      // Schema drift on the undocumented endpoint: record it, keep the recording pending, and
      // let the next cycle retry rather than dropping the meeting on the floor (docs/05 §3.1).
      await this.markError(tenantId, plaudId, err);
      if (err instanceof PlaudSchemaError) return 'noop';
      throw err;
    }

    // No has_transcript/has_summary flags exist — readiness is derived from block content.
    const ready = plaudIsReady(detail);
    if (!ready) {
      const [rec] = await this.deps.db
        .select({ firstSeenAt: plaudRecordings.firstSeenAt, alerted: plaudRecordings.stalledAlertSentAt })
        .from(plaudRecordings)
        .where(and(eq(plaudRecordings.tenantId, tenantId), eq(plaudRecordings.plaudId, plaudId)));
      const ageMs = this.now().getTime() - (rec?.firstSeenAt?.getTime() ?? this.now().getTime());
      if (ageMs > this.deps.stallHours * 3600_000) {
        if (!rec?.alerted) {
          this.deps.onStalled?.(tenantId, { plaudId, name: detail.name });
          await this.setState(tenantId, plaudId, { readiness: 'stalled', stalledAlertSentAt: this.now() });
        }
        return 'stalled';
      }
      await this.setState(tenantId, plaudId, { readiness: 'awaiting_transcript' });
      return 'advanced';
    }

    // Ready → import. contentHash guards against re-importing unchanged content (docs/05 §3.5).
    const segments = toTranscriptSegments(detail);
    const notes = plaudNotesMarkdown(detail);
    const hash = createHash('sha256')
      .update(JSON.stringify(segments) + '\n' + notes)
      .digest('hex');

    const [existing] = await this.deps.db
      .select({
        readiness: plaudRecordings.readiness,
        contentHash: plaudRecordings.contentHash,
        meetingId: plaudRecordings.meetingId,
        transcriptId: plaudRecordings.transcriptId,
        eventId: plaudRecordings.eventId,
      })
      .from(plaudRecordings)
      .where(and(eq(plaudRecordings.tenantId, tenantId), eq(plaudRecordings.plaudId, plaudId)));

    if (existing?.readiness === 'ingested' && existing.contentHash === hash) {
      if (existing.meetingId) return 'noop';
      // Backfill: event + transcript already exist (imported before meeting-creation existed),
      // just the meeting row is missing. Create it from the existing transcript — no re-import,
      // so no duplicate event/transcript. Self-heals the pre-3c imports.
      if (existing.transcriptId) {
        const meetingId = await this.createMeeting(
          tenantId,
          detail,
          existing.transcriptId,
          segments,
          notes,
          existing.eventId,
        );
        await this.setState(tenantId, plaudId, { meetingId });
        return 'imported';
      }
      return 'noop';
    }

    const runId = await this.deps.pipeline.startRun({
      tenantId,
      jobType: 'plaud_sync',
      refType: 'plaud_recording',
      refId: plaudId,
    });

    const transcriptR2Key = `tenants/${tenantId}/plaud/${plaudId}.transcript.json`;
    const notesR2Key = `tenants/${tenantId}/plaud/${plaudId}.notes.md`;

    await this.deps.pipeline.stage(runId, 'media_stored', async () => {
      await this.deps.r2.put(transcriptR2Key, Buffer.from(JSON.stringify(segments)), 'application/json');
      await this.deps.r2.put(notesR2Key, Buffer.from(notes), 'text/markdown');
    });

    const { eventId, transcriptId } = await this.deps.pipeline.stage(runId, 'transcribed', async () => {
      // externalId is unique → the import is idempotent; a re-run returns the existing event.
      const externalId = `plaud:${plaudId}`;
      const evRows = await this.deps.db
        .insert(events)
        .values({
          tenantId,
          source: 'plaud',
          type: 'note',
          direction: 'system',
          externalId,
          occurredAt: this.parseDate(detail.start_at) ?? this.now(),
          // Notes text drives nightly memory consolidation (which reads events.content) — 3d.
          content: notes,
          raw: { plaudId, name: detail.name },
        })
        .onConflictDoNothing({ target: events.externalId })
        .returning({ id: events.id });

      const evId =
        evRows[0]?.id ??
        (
          await this.deps.db
            .select({ id: events.id })
            .from(events)
            .where(and(eq(events.tenantId, tenantId), eq(events.externalId, externalId)))
            .limit(1)
        )[0]?.id;
      if (!evId) throw new Error(`plaud import: no event id for ${plaudId}`);

      const trRows = await this.deps.db
        .insert(transcripts)
        .values({
          tenantId,
          eventId: evId,
          status: 'done',
          sttProvider: 'plaud',
          diarizationMode: 'plaud',
          segments,
        })
        .returning({ id: transcripts.id });
      return { eventId: evId, transcriptId: trRows[0]?.id ?? null };
    });

    // Meeting row: the operator-facing object, with speakers resolved (docs/05 §3.6). Known
    // recurring speakers auto-confirm via alias; the rest await confirmation via the existing
    // POST /v1/meetings/:id/participants/:speakerKey/confirm route.
    const meetingId = transcriptId
      ? await this.deps.pipeline.stage(runId, 'structured', () =>
          this.createMeeting(tenantId, detail, transcriptId, segments, notes, eventId),
        )
      : null;

    await this.setState(tenantId, plaudId, {
      readiness: 'ingested',
      contentHash: hash,
      transcriptR2Key,
      notesR2Key,
      eventId,
      transcriptId,
      meetingId,
      ingestedAt: this.now(),
      error: null,
    });
    await this.deps.pipeline.completeRun(runId);
    return 'imported';
  }

  /** Backfill tasks for meetings that predate action-item extraction. Idempotent per meeting. */
  private async backfillMeetingTasks(tenantId: string): Promise<void> {
    const rows = await this.deps.db
      .select({ id: meetings.id, summary: meetings.summary })
      .from(meetings)
      .where(eq(meetings.tenantId, tenantId));
    for (const m of rows) {
      if (m.summary) await this.createTasks(tenantId, m.id, null, m.summary);
    }
  }

  /** Create the operator-facing meeting row with resolved speakers + calendar link. */
  private async createMeeting(
    tenantId: string,
    detail: PlaudFileDetail,
    transcriptId: string,
    segments: TranscriptSegment[],
    notes: string,
    eventId: string | null,
  ): Promise<string | null> {
    const labels = distinctSpeakers(segments);
    const [participants, calendarEventId] = await Promise.all([
      this.deps.speakers.resolveParticipants(tenantId, detail.serial_number ?? null, labels),
      this.deps.speakers.matchCalendarEvent(tenantId, this.parseDate(detail.start_at)),
    ]);
    const mRows = await this.deps.db
      .insert(meetings)
      .values({
        tenantId,
        transcriptId,
        calendarEventId,
        title: detail.name,
        occurredAt: this.parseDate(detail.start_at) ?? this.now(),
        participants,
        summary: notes,
      })
      .returning({ id: meetings.id });
    const meetingId = mRows[0]?.id ?? null;
    if (meetingId) await this.createTasks(tenantId, meetingId, eventId, notes);
    return meetingId;
  }

  /**
   * Turn the notes' action items into open tasks so they show up in Actions + the digest.
   * Idempotent: skips if this meeting already has tasks (safe on backfill / re-import).
   */
  private async createTasks(
    tenantId: string,
    meetingId: string,
    eventId: string | null,
    notes: string,
  ): Promise<void> {
    const items = plaudActionItems(notes).filter((i) => !i.done);
    if (items.length === 0) return;

    const [existing] = await this.deps.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.meetingId, meetingId)))
      .limit(1);
    if (existing) return;

    await this.deps.db.insert(tasks).values(
      items.map((i) => ({
        tenantId,
        title: i.text,
        status: 'open' as const,
        meetingId,
        sourceEventId: eventId,
      })),
    );
  }

  private async setState(
    tenantId: string,
    plaudId: string,
    patch: Partial<typeof plaudRecordings.$inferInsert>,
  ): Promise<void> {
    await this.deps.db
      .update(plaudRecordings)
      .set({ ...patch, updatedAt: this.now() })
      .where(and(eq(plaudRecordings.tenantId, tenantId), eq(plaudRecordings.plaudId, plaudId)));
  }

  private async markError(tenantId: string, plaudId: string, err: unknown): Promise<void> {
    await this.setState(tenantId, plaudId, {
      error: { message: err instanceof Error ? err.message : String(err), at: this.now().toISOString() },
    });
  }

  private parseDate(v: string | undefined): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
