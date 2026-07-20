import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { MediaService, type MediaDeps } from './media.service';

function makeDb(cfg: { dedupeHit: string | null; insertId: string | null }): Database {
  const make = (result: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['values', 'set', 'where', 'limit', 'from', 'returning']) q[m] = () => q;
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    select: () => make(cfg.dedupeHit ? [{ id: cfg.dedupeHit }] : []),
    insert: () => make(cfg.insertId ? [{ id: cfg.insertId }] : []),
    update: () => make([]),
  } as unknown as Database;
}

function makeDeps(cfg: {
  dedupeHit: string | null;
  insertId: string | null;
  mimeType: string;
}): MediaDeps & { put: ReturnType<typeof vi.fn>; enqueue: ReturnType<typeof vi.fn> } {
  const put = vi.fn(async () => undefined);
  const enqueue = vi.fn(async () => undefined);
  return {
    db: makeDb(cfg),
    r2: { put, presignPut: vi.fn() },
    meta: {
      getMediaMeta: vi.fn(async () => ({ url: 'https://m/x', mimeType: cfg.mimeType, fileSize: 3 })),
      download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    },
    enqueuer: { enqueue },
    pipeline: {
      stage: vi.fn(async (_r: string, _n: string, fn: () => Promise<unknown>) => fn()),
    } as unknown as MediaDeps['pipeline'],
    put,
    enqueue,
    now: () => new Date(0),
  };
}

const job = { tenantId: 't1', eventId: 'e1', mediaId: 'MID', mime: null, runId: 'run-1' };

describe('MediaService.fetchAndStore', () => {
  it('stores a new asset in R2 and enqueues transcription for audio', async () => {
    const deps = makeDeps({ dedupeHit: null, insertId: 'ma1', mimeType: 'audio/ogg' });
    const result = await new MediaService(deps).fetchAndStore(job);
    expect(result).toEqual({ mediaAssetId: 'ma1' });
    expect(deps.put).toHaveBeenCalledOnce();
    expect(deps.enqueue).toHaveBeenCalledWith(
      'recall-transcription',
      'transcription.run',
      expect.objectContaining({ mediaAssetId: 'ma1' }),
    );
  });

  it('reuses an existing asset on sha256 dedupe (no R2 put)', async () => {
    const deps = makeDeps({ dedupeHit: 'ma-existing', insertId: null, mimeType: 'audio/ogg' });
    const result = await new MediaService(deps).fetchAndStore(job);
    expect(result).toEqual({ mediaAssetId: 'ma-existing' });
    expect(deps.put).not.toHaveBeenCalled();
    expect(deps.enqueue).toHaveBeenCalledOnce();
  });

  it('does not enqueue transcription for non-audio media', async () => {
    const deps = makeDeps({ dedupeHit: null, insertId: 'ma2', mimeType: 'image/jpeg' });
    await new MediaService(deps).fetchAndStore(job);
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('throws when the media insert returns no id', async () => {
    const deps = makeDeps({ dedupeHit: null, insertId: null, mimeType: 'audio/ogg' });
    await expect(new MediaService(deps).fetchAndStore(job)).rejects.toThrow(/no id/);
  });
});
