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
  it('parses the recorded list_files page (data wrapper)', async () => {
    const { client, fetchMock } = clientReturning(fixture('list_files.json'));
    const { files, nextCursor } = await client.listFiles();
    expect(files).toHaveLength(2);
    expect(files[0]?.id).toBe('fe0aac1e4e636030d03b09d96656e910');
    expect(files[0]?.duration).toBe(2367000);
    // 2 items < default page size 50 → no next page.
    expect(nextCursor).toBeNull();
    // Auth header carries the minted access token, never the refresh token.
    expect(fetchMock.mock.calls[0]![1].headers.authorization).toBe('Bearer access-tok');
  });

  it('hits the real page-based files endpoint', async () => {
    const { client, fetchMock } = clientReturning({ data: [] });
    await client.listFiles({ page: 2, pageSize: 100 });
    const url = fetchMock.mock.calls[0]![0];
    expect(url).toContain('/open/third-party/files/?page=2&page_size=100');
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
  it('parses a ready file with source + note blocks', async () => {
    const { client } = clientReturning(fixture('get_file_ready.json'));
    const detail = await client.getFile('fe0aac1e4e636030d03b09d96656e910');
    expect(detail.source_list.map((b) => b.data_type)).toContain('transaction');
    expect(detail.note_list[0]?.data_type).toBe('auto_sum_note');
    expect(detail.presigned_url).toContain('media.plaud.ai');
  });

  it('parses a not-ready file: empty source and note lists', async () => {
    const { client } = clientReturning(fixture('get_file_not_ready.json'));
    const detail = await client.getFile('24647a317467f2cac813eddb9e1a81f0');
    expect(detail.source_list).toEqual([]);
    expect(detail.note_list).toEqual([]);
    expect(detail.presigned_url).toBeNull();
  });

  it('url-encodes the file id in the path', async () => {
    const { client, fetchMock } = clientReturning(fixture('get_file_ready.json'));
    await client.getFile('rec/with space');
    expect(fetchMock.mock.calls[0]![0]).toContain('/open/third-party/files/rec%2Fwith%20space');
  });
});

describe('toTranscriptSegments', () => {
  it('parses the transaction block JSON into persisted TranscriptSegments', () => {
    const detail = fixture('get_file_ready.json') as Parameters<typeof toTranscriptSegments>[0];
    const segs = toTranscriptSegments(detail);
    expect(segs[0]).toEqual({
      startMs: 3210,
      endMs: 8200,
      speakerKey: 'Speaker 1',
      text: 'Oke jadi kita mulai ya, soal pricing Q3.',
    });
    // Speaker labels are preserved verbatim — identity resolution is Phase 3c.
    expect(segs[1]?.speakerKey).toBe('Speaker 2');
  });

  it('returns [] when there is no transaction block (not-ready file)', () => {
    const detail = fixture('get_file_not_ready.json') as Parameters<typeof toTranscriptSegments>[0];
    expect(toTranscriptSegments(detail)).toEqual([]);
  });
});
