/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/structuring.service.ts
 * Role    : Single DeepSeek reasoning pass over a transcript → Meeting Note (topics, summary,
 *           decisions, actions, open questions, speaker suggestions, recommendations). Persists
 *           the meeting + task rows. Wrapped in the `structured` stage + token metering.
 *           Recommendations are transcript-only here; memory injection is the Phase 6 hook.
 * Exports : StructuringService, StructureJob
 */
import { structuringOutputSchema } from '@recall/shared';

import type { Database } from '../db/client';
import {
  meetings,
  tasks,
  transcripts,
  type MeetingParticipant,
  type TranscriptSegment,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import type { LlmClient } from './llm/types';
import { parseStructured } from './llm/parse';
import { buildStructuringUser, STRUCTURING_SYSTEM } from './llm/prompts';
import { costModelFor, MODEL_ROUTING, TEMPERATURE } from './llm/router';
import type { PipelineService } from './pipeline.service';

export interface StructureJob {
  tenantId: string;
  eventId: string;
  transcriptId: string;
  runId: string;
  occurredAt: Date;
  attendees?: string[];
}

/** Phase 6 wires memory retrieval here; Phase 3 no-ops it. */
export type RetrievalHook = (job: StructureJob) => Promise<string | undefined>;

export interface StructuringDeps {
  db: Database;
  llm: LlmClient;
  pipeline: Pick<PipelineService, 'stage' | 'meterCost'>;
  retrieval?: RetrievalHook;
}

function safeDate(value: string | null): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t);
}

export class StructuringService {
  constructor(private readonly deps: StructuringDeps) {}

  async structure(job: StructureJob): Promise<{ meetingId: string }> {
    const [transcript] = await this.deps.db
      .select({ language: transcripts.language, segments: transcripts.segments })
      .from(transcripts)
      .where(eq(transcripts.id, job.transcriptId));
    if (!transcript) throw new Error(`structuring: transcript ${job.transcriptId} not found`);

    const segments = transcript.segments as TranscriptSegment[];
    const durationSec = (segments.at(-1)?.endMs ?? 0) / 1000;
    const participantContext = await this.deps.retrieval?.(job);

    const user = buildStructuringUser({
      language: transcript.language ?? 'unknown',
      durationSec,
      attendees: job.attendees,
      participantContext,
      segments,
    });

    const { data, usage } = await this.deps.pipeline.stage(job.runId, 'structured', () =>
      parseStructured(this.deps.llm, {
        schema: structuringOutputSchema,
        system: STRUCTURING_SYSTEM,
        user,
        model: MODEL_ROUTING.structuring,
        temperature: TEMPERATURE.structuring,
      }),
    );

    await this.deps.pipeline.meterCost(job.runId, {
      tokensIn: usage.promptTokens,
      tokensOut: usage.completionTokens,
      model: costModelFor(MODEL_ROUTING.structuring),
    });

    const participants: MeetingParticipant[] = data.speakers.map((s) => ({
      speakerKey: s.speakerKey,
      suggestedName: s.suggestedName ?? undefined,
      confirmed: false,
      confidence: s.confidence,
    }));

    const rows = await this.deps.db
      .insert(meetings)
      .values({
        tenantId: job.tenantId,
        transcriptId: job.transcriptId,
        title: data.topics[0]?.title ?? 'Untitled meeting',
        occurredAt: job.occurredAt,
        durationSec,
        participants,
        topics: data.topics,
        summary: data.summary,
        decisions: data.decisions,
        openQuestions: data.openQuestions,
        recommendations: data.recommendations.map((r) => ({
          speakerKey: r.speakerKey,
          advice: r.advice,
        })),
        attributionConfidence: data.attributionConfidence,
      })
      .returning({ id: meetings.id });

    const meetingId = rows[0]?.id;
    if (!meetingId) throw new Error('structuring: meeting insert returned no id');

    for (const action of data.actions) {
      await this.deps.db.insert(tasks).values({
        tenantId: job.tenantId,
        title: action.title,
        sourceEventId: job.eventId,
        meetingId,
        dueAt: safeDate(action.deadline),
        normalizedLang: 'en',
      });
    }

    return { meetingId };
  }
}
