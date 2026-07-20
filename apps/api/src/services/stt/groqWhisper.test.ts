import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroqWhisperProvider } from './groqWhisper';

afterEach(() => vi.unstubAllGlobals());

describe('GroqWhisperProvider', () => {
  it('maps verbose_json segments to ms and reads language/duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          language: 'id',
          duration: 30.2,
          segments: [
            { start: 0, end: 6.0, text: ' Halo ' },
            { start: 6.0, end: 14.4, text: 'oke' },
          ],
        }),
      })),
    );
    const result = await new GroqWhisperProvider('groq-key').transcribe(new Uint8Array([1, 2]), 'a.ogg');
    expect(result.language).toBe('id');
    expect(result.durationSec).toBe(30.2);
    expect(result.segments).toEqual([
      { startMs: 0, endMs: 6000, text: 'Halo' },
      { startMs: 6000, endMs: 14400, text: 'oke' },
    ]);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(
      new GroqWhisperProvider('groq-key').transcribe(new Uint8Array([1]), 'a.ogg'),
    ).rejects.toThrow(/groq stt failed: 500/);
  });
});
