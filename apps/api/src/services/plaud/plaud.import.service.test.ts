import { describe, expect, it, vi } from 'vitest';

import { events, plaudRecordings, transcripts } from '../../db/schema';
import type { Database } from '../../db/client';
import { PlaudImportService } from './plaud.import.service';
import type { PlaudClient } from './plaud.client';
import type { PipelineService } from '../pipeline.service';

/**
 * FIFO-per-table fake drizzle handle. `select`/`insert` shift the next queued result for the
 * target table, so a test scripts the exact query sequence the service walks. `update` records
 * the set() payloads for assertion.
 */
function fakeDb(cfg: {
  selects: { table: unknown; rows: unknown[] }[];
  inserts: { table: unknown; rows: unknown[] }[];
  onUpdate: (payload: Record<string, unknown>) => void;
}): Database {
  const selectQ = [...cfg.selects];
  const insertQ = [...cfg.inserts];
  const thenable = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'values', 'onConflictDoNothing', 'set', 'returning']) q[m] = () => q;
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(rows).then(res, rej);
    return q;
  };
  return {
    select: () => {
      // Resolve which table this select targets by peeking the queued script in order.
      const next = selectQ.shift();
      const rows = next?.rows ?? [];
      const q = thenable(rows);
      return q;
    },
    insert: (table: unknown) => {
      const idx = insertQ.findIndex((i) => i.table === table);
      const rows = idx >= 0 ? insertQ.splice(idx, 1)[0]!.rows : [];
      return thenable(rows);
    },
    update: () => {
      const q: Record<string, unknown> = {};
      q.set = (payload: Record<string, unknown>) => {
        cfg.onUpdate(payload);
        return q;
      };
      q.where = () => Promise.resolve([]);
      return q;
    },
  } as unknown as Database;
}

function pipeline() {
  const startRun = vi.fn(async () => 'run-1');
  const stage = vi.fn(async (_r: string, _n: string, fn: () => Promise<unknown>) => fn());
  const completeRun = vi.fn(async () => undefined);
  const asPipeline = { startRun, stage, completeRun } as unknown as Pick<PipelineService, 'startRun' | 'stage' | 'completeRun'>;
  return Object.assign(asPipeline, { startRun, stage, completeRun });
}

const READY = {
  id: 'p1',
  name: 'Rapat',
  created_at: '2026-08-08T06:00:00Z',
  start_at: '2026-08-08T05:00:00Z',
  duration: 4230000,
  serial_number: 'SN1',
  presigned_url: 'https://m/p1.mp3',
  source_list: [
    {
      data_type: 'transaction',
      data_content: JSON.stringify([{ content: 'halo', start_time: 0, end_time: 8200, speaker: 'Speaker 1' }]),
    },
  ],
  note_list: [{ data_type: 'auto_sum_note', data_content: '## Notes\n- decided X' }],
};
const NOT_READY = { ...READY, source_list: [], note_list: [] };

function client(detail: unknown): PlaudClient {
  return {
    listFiles: vi.fn(async () => ({
      files: [{ id: 'p1', name: 'Rapat', created_at: READY.created_at, start_at: READY.start_at, duration: 4230000, serial_number: 'SN1' }],
      nextCursor: null,
    })),
    getFile: vi.fn(async () => detail as never),
  } as unknown as PlaudClient;
}

const r2 = () => ({ put: vi.fn(async () => undefined) });

describe('PlaudImportService state machine', () => {
  it('imports a ready recording: event + transcript + 2 R2 mirrors + ingested', async () => {
    const updates: Record<string, unknown>[] = [];
    const db = fakeDb({
      selects: [
        { table: plaudRecordings, rows: [{ plaudId: 'p1', readiness: 'discovered' }] }, // sync() pending list
        { table: plaudRecordings, rows: [{ readiness: 'discovered', contentHash: null }] }, // existing check
      ],
      inserts: [
        { table: plaudRecordings, rows: [{ id: 'rec1' }] }, // discover insert (new)
        { table: events, rows: [{ id: 'ev1' }] },
        { table: transcripts, rows: [{ id: 'tr1' }] },
      ],
      onUpdate: (p) => updates.push(p),
    });
    const p = pipeline();
    const r = r2();
    const svc = new PlaudImportService({ db, plaud: client(READY), r2: r, pipeline: p, stallHours: 48, now: () => new Date('2026-08-08T10:00:00Z') });

    const result = await svc.sync('t1');
    expect(result.imported).toBe(1);
    expect(r.put).toHaveBeenCalledTimes(2); // transcript json + notes md, NOT audio
    expect(p.startRun).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'plaud_sync' }));
    expect(p.completeRun).toHaveBeenCalledOnce();
    // Final state write flips to ingested with a content hash.
    const ingested = updates.find((u) => u.readiness === 'ingested');
    expect(ingested).toBeTruthy();
    expect(ingested?.contentHash).toEqual(expect.any(String));
    expect(ingested?.eventId).toBe('ev1');
    expect(ingested?.transcriptId).toBe('tr1');
  });

  it('holds a not-ready recording at awaiting_transcript without importing', async () => {
    const updates: Record<string, unknown>[] = [];
    const db = fakeDb({
      selects: [
        { table: plaudRecordings, rows: [{ plaudId: 'p1', readiness: 'discovered' }] },
        { table: plaudRecordings, rows: [{ firstSeenAt: new Date('2026-08-08T09:50:00Z'), alerted: null }] }, // recent
      ],
      inserts: [{ table: plaudRecordings, rows: [] }], // already discovered
      onUpdate: (p) => updates.push(p),
    });
    const p = pipeline();
    const r = r2();
    const svc = new PlaudImportService({ db, plaud: client(NOT_READY), r2: r, pipeline: p, stallHours: 48, now: () => new Date('2026-08-08T10:00:00Z') });

    const result = await svc.sync('t1');
    expect(result.advanced).toBe(1);
    expect(result.imported).toBe(0);
    expect(r.put).not.toHaveBeenCalled();
    expect(p.startRun).not.toHaveBeenCalled();
    expect(updates.at(-1)?.readiness).toBe('awaiting_transcript');
  });

  it('marks a long-unready recording stalled and fires the alert once', async () => {
    const onStalled = vi.fn();
    const updates: Record<string, unknown>[] = [];
    const db = fakeDb({
      selects: [
        { table: plaudRecordings, rows: [{ plaudId: 'p1', readiness: 'awaiting_transcript' }] },
        { table: plaudRecordings, rows: [{ firstSeenAt: new Date('2026-08-05T00:00:00Z'), alerted: null }] }, // 3 days old
      ],
      inserts: [{ table: plaudRecordings, rows: [] }],
      onUpdate: (p) => updates.push(p),
    });
    const svc = new PlaudImportService({
      db,
      plaud: client(NOT_READY),
      r2: r2(),
      pipeline: pipeline(),
      stallHours: 48,
      now: () => new Date('2026-08-08T10:00:00Z'),
      onStalled,
    });
    const result = await svc.sync('t1');
    expect(result.stalled).toBe(1);
    expect(onStalled).toHaveBeenCalledWith('t1', { plaudId: 'p1', name: 'Rapat' });
    expect(updates.at(-1)?.readiness).toBe('stalled');
  });

  it('is idempotent: an already-ingested recording with an unchanged hash is a no-op', async () => {
    // Pre-compute the hash the service will derive for READY so the "existing" row matches.
    const { createHash } = await import('node:crypto');
    const segments = [{ startMs: 0, endMs: 8200, speakerKey: 'Speaker 1', text: 'halo' }];
    const hash = createHash('sha256').update(JSON.stringify(segments) + '\n' + '## Notes\n- decided X').digest('hex');
    const updates: Record<string, unknown>[] = [];
    const db = fakeDb({
      selects: [
        { table: plaudRecordings, rows: [{ plaudId: 'p1', readiness: 'ingested' }] },
        { table: plaudRecordings, rows: [{ readiness: 'ingested', contentHash: hash }] },
      ],
      inserts: [{ table: plaudRecordings, rows: [] }],
      onUpdate: (p) => updates.push(p),
    });
    const p = pipeline();
    const svc = new PlaudImportService({ db, plaud: client(READY), r2: r2(), pipeline: p, stallHours: 48, now: () => new Date('2026-08-08T10:00:00Z') });
    const result = await svc.sync('t1');
    expect(result.imported).toBe(0);
    expect(p.startRun).not.toHaveBeenCalled(); // no re-import, no cost run
  });
});
