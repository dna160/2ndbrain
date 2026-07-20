/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/transcription.service.ts
 * Role    : STT + diarization → persisted transcript, wrapped in the `transcribed` stage +
 *           sttSeconds cost metering (docs/03 Phase 3 task 2).
 * Exports : TranscriptionService, TranscribeJob
 */
import type { Database } from '../db/client';
import { transcripts } from '../db/schema';
import type { PipelineService } from './pipeline.service';
import type { DiarizationProvider, SpeakerTurn } from './stt/diarization.provider';
import type { SttProvider } from './stt/provider';

export interface TranscribeJob {
  tenantId: string;
  eventId: string;
  runId: string;
  audio: Uint8Array;
  filename: string;
}

export interface TranscriptionDeps {
  db: Database;
  stt: SttProvider;
  diarization: DiarizationProvider;
  diarizationMode: 'none' | 'llm' | 'pyannote';
  pipeline: Pick<PipelineService, 'stage' | 'meterCost'>;
}

function speakerAt(turns: SpeakerTurn[], startMs: number): string {
  const turn = turns.find((t) => startMs >= t.startMs && startMs < t.endMs);
  return turn?.speakerKey ?? turns[0]?.speakerKey ?? 'S1';
}

export class TranscriptionService {
  constructor(private readonly deps: TranscriptionDeps) {}

  async transcribe(job: TranscribeJob): Promise<{ transcriptId: string; language: string }> {
    const result = await this.deps.pipeline.stage(job.runId, 'transcribed', () =>
      this.deps.stt.transcribe(job.audio, job.filename),
    );
    const turns = await this.deps.diarization.diarize(job.audio, result.segments);
    const segments = result.segments.map((s) => ({
      startMs: s.startMs,
      endMs: s.endMs,
      speakerKey: speakerAt(turns, s.startMs),
      text: s.text,
    }));

    await this.deps.pipeline.meterCost(job.runId, { sttSeconds: result.durationSec });

    const rows = await this.deps.db
      .insert(transcripts)
      .values({
        tenantId: job.tenantId,
        eventId: job.eventId,
        status: 'done',
        language: result.language,
        languageConfidence: result.languageConfidence,
        sttProvider: 'groq-whisper-v3',
        diarizationMode: this.deps.diarizationMode,
        segments,
      })
      .returning({ id: transcripts.id });

    const transcriptId = rows[0]?.id;
    if (!transcriptId) throw new Error('transcription: insert returned no id');
    return { transcriptId, language: result.language };
  }
}
