/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/stt/groqWhisper.ts
 * Role    : Groq Whisper-large-v3 STT (OpenAI-compatible audio endpoint), verbose_json →
 *           timestamped segments. Verbatim, multilingual (docs/01 ADR-3).
 * Exports : GroqWhisperProvider
 */
import type { SttProvider, SttResult } from './provider';

interface VerboseJson {
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

export class GroqWhisperProvider implements SttProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.groq.com/openai/v1',
    private readonly model = 'whisper-large-v3',
  ) {}

  async transcribe(audio: Uint8Array, filename: string): Promise<SttResult> {
    const form = new FormData();
    form.append('file', new Blob([audio]), filename);
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`groq stt failed: ${res.status}`);

    const json = (await res.json()) as VerboseJson;
    const segments = (json.segments ?? []).map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
    }));
    const durationSec = json.duration ?? (segments.at(-1)?.endMs ?? 0) / 1000;
    return {
      language: json.language ?? 'unknown',
      languageConfidence: 1, // Whisper verbose_json exposes no per-language confidence
      durationSec,
      segments,
    };
  }
}
