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

/** Blob type by extension. Whisper reads the filename, but an untyped Blob is sent as
 *  application/octet-stream, which some gateways reject before Groq ever sees it. */
const EXT_MIME: Record<string, string> = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

export interface GroqWhisperOptions {
  /**
   * ISO-639-1 hint (e.g. 'id'). Whisper otherwise re-detects per 30s window, which on
   * ID/EN code-switching drifts mid-file and can flip into translating instead of
   * transcribing. Leave unset only if the corpus is genuinely multi-language.
   */
  language?: string;
  /**
   * Initial prompt — the single biggest lever for proper nouns. Whisper conditions on it,
   * so seeding names/companies/jargon stops them being mangled phonetically. Max ~224 tokens;
   * only the tail is used, so put the highest-value terms last.
   */
  prompt?: string;
}

export class GroqWhisperProvider implements SttProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.groq.com/openai/v1',
    private readonly model = 'whisper-large-v3',
    private readonly options: GroqWhisperOptions = {},
  ) {}

  async transcribe(audio: Uint8Array, filename: string): Promise<SttResult> {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const form = new FormData();
    form.append('file', new Blob([audio], { type: EXT_MIME[ext] ?? 'audio/ogg' }), filename);
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    // Greedy decoding. Without this Groq may fall back to sampling on low-confidence
    // windows, which is where Whisper's looping/hallucinated filler comes from.
    form.append('temperature', '0');
    if (this.options.language) form.append('language', this.options.language);
    if (this.options.prompt) form.append('prompt', this.options.prompt);

    const res = await fetch(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`groq stt failed: ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
    }

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
