/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/stt/diarization.provider.ts
 * Role    : Diarization interface + Noop impl (single speaker). pyannote is SCAFFOLD ONLY —
 *           gated on the <70% attribution metric (docs/00 F2, docs/01 ADR-3). Do not build it.
 * Exports : DiarizationProvider, NoopDiarization, getDiarizationProvider
 */
import type { SttSegment } from './provider';

export interface SpeakerTurn {
  startMs: number;
  endMs: number;
  speakerKey: string;
}

export interface DiarizationProvider {
  diarize(audio: Uint8Array, segments: SttSegment[]): Promise<SpeakerTurn[]>;
}

/** Lean mode: one speaker; LLM attribution refines speakers during structuring (docs/04 §2). */
export class NoopDiarization implements DiarizationProvider {
  diarize(_audio: Uint8Array, segments: SttSegment[]): Promise<SpeakerTurn[]> {
    return Promise.resolve(
      segments.map((s) => ({ startMs: s.startMs, endMs: s.endMs, speakerKey: 'S1' })),
    );
  }
}

export function getDiarizationProvider(mode: 'none' | 'pyannote'): DiarizationProvider {
  if (mode === 'pyannote') {
    // NotImplemented — pyannote requires GPU infra; add a real provider here when the
    // trailing attribution-confidence metric drops below 70% (docs/00 §6).
    throw new Error('pyannote diarization not implemented — see docs/01 ADR-3');
  }
  return new NoopDiarization();
}
