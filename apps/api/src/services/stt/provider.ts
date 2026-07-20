/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/stt/provider.ts
 * Role    : Speech-to-text provider contract (docs/03 Phase 3 task 1). Verbatim transcript as
 *           spoken (ID/EN/mixed), timestamped segments in ms.
 * Exports : SttProvider, SttResult, SttSegment
 */
export interface SttSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface SttResult {
  language: string;
  languageConfidence: number;
  durationSec: number;
  segments: SttSegment[];
}

export interface SttProvider {
  transcribe(audio: Uint8Array, filename: string): Promise<SttResult>;
}
