import { QUEUES } from '@recall/shared/constants';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { events } from '../db/schema';
import { IngestService, type IngestDeps } from './ingest.service';

// Fake drizzle handle: chain methods return the same thenable; insert(events) resolves the
// configured event-insert result, select resolves the blocked flag.
function makeIngestDb(cfg: { blocked: boolean; eventInsertId: string | null }): Database {
  const make = (result: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of [
      'values',
      'set',
      'where',
      'limit',
      'from',
      'onConflictDoNothing',
      'onConflictDoUpdate',
      'returning',
    ]) {
      q[m] = () => q;
    }
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    insert: (table: unknown) =>
      make(table === events ? (cfg.eventInsertId ? [{ id: cfg.eventInsertId }] : []) : []),
    select: () => make([{ blocked: cfg.blocked }]),
    update: () => make([]),
  } as unknown as Database;
}

function makeDeps(cfg: { blocked: boolean; eventInsertId: string | null }): IngestDeps & {
  enqueue: ReturnType<typeof vi.fn>;
  startRun: ReturnType<typeof vi.fn>;
  completeRun: ReturnType<typeof vi.fn>;
  recordDrop: ReturnType<typeof vi.fn>;
} {
  const enqueue = vi.fn(async () => undefined);
  const startRun = vi.fn(async () => 'run-1');
  const stage = vi.fn(async (_r: string, _n: string, fn: () => Promise<unknown>) => fn());
  const completeRun = vi.fn(async () => undefined);
  const recordDrop = vi.fn();
  return {
    db: makeIngestDb(cfg),
    enqueuer: { enqueue },
    pipeline: { startRun, stage, completeRun } as unknown as IngestDeps['pipeline'],
    recordDrop,
    enqueue,
    startRun,
    completeRun,
    now: () => new Date(0),
  };
}

function textPayload(waId: string, msgId: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PN1' },
              messages: [{ id: msgId, from: waId, type: 'text', timestamp: '1700000000', text: { body: 'hi' } }],
            },
          },
        ],
      },
    ],
  };
}

function voicePayload(waId: string, msgId: string) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'PN1' },
              messages: [
                {
                  id: msgId,
                  from: waId,
                  type: 'audio',
                  timestamp: '1700000000',
                  audio: { id: 'MID-9', mime_type: 'audio/ogg', voice: true },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('IngestService.ingestPayload', () => {
  it('returns zeros for a payload with no inbound messages', async () => {
    const deps = makeDeps({ blocked: false, eventInsertId: 'e1' });
    const result = await new IngestService(deps).ingestPayload('t1', { entry: [] });
    expect(result).toEqual({ received: true, persisted: 0, duplicates: 0, dropped: 0 });
    expect(deps.startRun).not.toHaveBeenCalled();
  });

  it('drops blacklisted senders and persists nothing', async () => {
    const deps = makeDeps({ blocked: true, eventInsertId: 'e1' });
    const result = await new IngestService(deps).ingestPayload('t1', textPayload('628a', 'wamid.1'));
    expect(result.dropped).toBe(1);
    expect(result.persisted).toBe(0);
    expect(deps.recordDrop).toHaveBeenCalledWith('628a');
    expect(deps.startRun).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('persists a new text message and completes the run (no media)', async () => {
    const deps = makeDeps({ blocked: false, eventInsertId: 'e1' });
    const result = await new IngestService(deps).ingestPayload('t1', textPayload('628a', 'wamid.2'));
    expect(result.persisted).toBe(1);
    expect(deps.startRun).toHaveBeenCalledOnce();
    expect(deps.completeRun).toHaveBeenCalledOnce();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('enqueues the media job for a new voice note', async () => {
    const deps = makeDeps({ blocked: false, eventInsertId: 'e2' });
    const result = await new IngestService(deps).ingestPayload('t1', voicePayload('628a', 'wamid.3'));
    expect(result.persisted).toBe(1);
    expect(deps.enqueue).toHaveBeenCalledWith(QUEUES.media, 'media.fetch', expect.objectContaining({ eventId: 'e2', mediaId: 'MID-9' }));
    expect(deps.completeRun).not.toHaveBeenCalled();
  });

  it('counts a duplicate (idempotent) message without re-processing', async () => {
    const deps = makeDeps({ blocked: false, eventInsertId: null });
    const result = await new IngestService(deps).ingestPayload('t1', textPayload('628a', 'wamid.2'));
    expect(result.duplicates).toBe(1);
    expect(result.persisted).toBe(0);
    expect(deps.startRun).not.toHaveBeenCalled();
  });

  it('drops without a recordDrop callback and uses the default clock', async () => {
    const deps = makeDeps({ blocked: true, eventInsertId: null });
    // exercise the optional recordDrop absent + default now() branches
    const svc = new IngestService({
      db: deps.db,
      enqueuer: deps.enqueuer,
      pipeline: deps.pipeline,
    });
    const result = await svc.ingestPayload('t1', textPayload('628a', 'wamid.9'));
    expect(result.dropped).toBe(1);
  });

  it('treats an unseen contact (no row) as not blocked', async () => {
    // fake db whose blocked SELECT returns [] → rows[0]?.blocked ?? false
    const make = (result: unknown[]) => {
      const q: Record<string, unknown> = {};
      for (const m of ['values', 'set', 'where', 'limit', 'from', 'onConflictDoNothing', 'returning']) {
        q[m] = () => q;
      }
      q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej);
      return q;
    };
    const db = {
      insert: () => make([{ id: 'e-new' }]),
      select: () => make([]), // contact not found
      update: () => make([]),
    } as unknown as Database;
    const svc = new IngestService({
      db,
      enqueuer: { enqueue: vi.fn(async () => undefined) },
      pipeline: {
        startRun: vi.fn(async () => 'r'),
        stage: vi.fn(async (_r: string, _n: string, fn: () => Promise<unknown>) => fn()),
        completeRun: vi.fn(async () => undefined),
      } as unknown as IngestDeps['pipeline'],
    });
    const result = await svc.ingestPayload('t1', textPayload('628z', 'wamid.10'));
    expect(result.persisted).toBe(1);
  });
});
