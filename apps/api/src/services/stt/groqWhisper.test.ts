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

  it('throws on a non-OK response, including Groq\'s error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'model overloaded' })),
    );
    await expect(
      new GroqWhisperProvider('groq-key').transcribe(new Uint8Array([1]), 'a.ogg'),
    ).rejects.toThrow(/groq stt failed: 500 — model overloaded/);
  });

  async function sentForm(opts?: { language?: string; prompt?: string }, filename = 'a.ogg') {
    const fetchMock = vi.fn(async (_url: string, _init: { body: FormData }) => ({
      ok: true,
      json: async () => ({ language: 'id', duration: 1, segments: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await new GroqWhisperProvider('groq-key', undefined, undefined, opts).transcribe(
      new Uint8Array([1]),
      filename,
    );
    return fetchMock.mock.calls[0]![1].body;
  }

  it('always pins temperature to 0 — sampling is where Whisper hallucinates filler', async () => {
    expect((await sentForm()).get('temperature')).toBe('0');
  });

  it('omits language and prompt when not configured', async () => {
    const form = await sentForm();
    expect(form.get('language')).toBeNull();
    expect(form.get('prompt')).toBeNull();
  });

  it('forwards the language hint and initial prompt when configured', async () => {
    const form = await sentForm({ language: 'id', prompt: 'Lynkbot, Recall, Jakarta' });
    expect(form.get('language')).toBe('id');
    expect(form.get('prompt')).toBe('Lynkbot, Recall, Jakarta');
  });

  it('types the upload by extension so it is not sent as octet-stream', async () => {
    expect(((await sentForm(undefined, 'a.ogg')).get('file') as File).type).toBe('audio/ogg');
    expect(((await sentForm(undefined, 'a.m4a')).get('file') as File).type).toBe('audio/mp4');
    // Unknown extension falls back to ogg — WhatsApp voice notes are the dominant input.
    expect(((await sentForm(undefined, 'a.xyz')).get('file') as File).type).toBe('audio/ogg');
  });
});
