import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { HttpPlaudClient, PlaudSchemaError, toTranscriptSegments } from './plaud.client';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../../../fixtures/plaud');
const fixture = (name: string): unknown => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));

afterEach(() => vi.unstubAllGlobals());

function clientReturning(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async (_url: string, _init: { headers: Record<string, string> }) => ({ ok, status, json: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return { client: new HttpPlaudClient('https://plaud.test/api', async () => 'access-tok'), fetchMock };
}

describe('HttpPlaudClient.listFiles', () => {
  it('parses the recorded list_files page and exposes the cursor', async () => {
    const { client, fetchMock } = clientReturning(fixture('list_files.json'));
    const { files, nextCursor } = await client.listFiles();
    expect(files).toHaveLength(2);
    expect(files[0]?.id).toBe('rec_2026072114_abc123');
    expect(files[0]?.duration).toBe(4230000);
    expect(nextCursor).toBe('eyJvZmZzZXQiOjJ9');
    // Auth header carries the minted access token, never the refresh token.
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer access-tok');
  });

  it('forwards cursor / page_size / date_from as query params', async () => {
    const { client, fetchMock } = clientReturning({ files: [] });
    await client.listFiles({ cursor: 'c1', pageSize: 100, createdFrom: '2026-07-20T00:00:00Z' });
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toContain('cursor=c1');
    expect(url).toContain('page_size=100');
    expect(url).toContain('date_from=2026-07-20');
  });

  it('throws PlaudSchemaError on a drifted response (undocumented-endpoint guard)', async () => {
    const { client } = clientReturning({ files: [{ id: 123 }] }); // id must be a string
    await expect(client.listFiles()).rejects.toBeInstanceOf(PlaudSchemaError);
  });

  it('throws on a non-2xx response', async () => {
    const { client } = clientReturning({}, false, 500);
    await expect(client.listFiles()).rejects.toThrow(/failed: 500/);
  });
});

describe('HttpPlaudClient.getFile', () => {
  it('parses a ready file with transcript + notes', async () => {
    const { client } = clientReturning(fixture('get_file_ready.json'));
    const detail = await client.getFile('rec_2026072114_abc123');
    expect(detail.has_transcript).toBe(true);
    expect(detail.has_summary).toBe(true);
    expect(detail.source_list).toHaveLength(3);
    expect(detail.presigned_url).toContain('media.plaud.ai');
  });

  it('parses a not-ready file: empty transcript, availability booleans false', async () => {
    const { client } = clientReturning(fixture('get_file_not_ready.json'));
    const detail = await client.getFile('rec_2026072109_def456');
    expect(detail.has_transcript).toBe(false);
    expect(detail.source_list).toEqual([]);
    expect(detail.presigned_url).toBeNull();
  });

  it('url-encodes the file id in the path', async () => {
    const { client, fetchMock } = clientReturning(fixture('get_file_ready.json'));
    await client.getFile('rec/with space');
    expect(fetchMock.mock.calls[0]![0]).toContain('/files/rec%2Fwith%20space');
  });
});

describe('toTranscriptSegments', () => {
  it('normalizes Plaud segments to the persisted TranscriptSegment shape', () => {
    const detail = fixture('get_file_ready.json') as { source_list: never[] };
    const segs = toTranscriptSegments(
      (detail.source_list as unknown as { start: number; end: number; speaker: string; text: string }[]),
    );
    expect(segs[0]).toEqual({
      startMs: 0,
      endMs: 8200,
      speakerKey: 'Speaker 1',
      text: 'Oke jadi kita mulai ya, soal pricing Q3.',
    });
    // Speaker labels are preserved verbatim — identity resolution is Phase 3c.
    expect(segs[1]?.speakerKey).toBe('Speaker 2');
  });
});
