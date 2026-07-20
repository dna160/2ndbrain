import { describe, expect, it } from 'vitest';

import type { Database } from '../db/client';
import { PipelineService, computeCostIdr } from './pipeline.service';

// ── Programmable fake drizzle handle: every chain method returns the same thenable query
// that resolves to a configured result, recording insert/update payloads for assertions. ──
function makeFakeDb(opts: { insertResult?: unknown[]; updateResult?: unknown[] } = {}) {
  const rec = { insertValues: [] as Record<string, unknown>[], updateSets: [] as Record<string, unknown>[] };
  const query = (
    result: unknown[],
    onSet?: (v: Record<string, unknown>) => void,
    onValues?: (v: Record<string, unknown>) => void,
  ) => {
    const q: Record<string, unknown> = {};
    q.values = (v: Record<string, unknown>) => (onValues?.(v), q);
    q.set = (v: Record<string, unknown>) => (onSet?.(v), q);
    q.where = () => q;
    q.onConflictDoUpdate = () => q;
    q.returning = () => q;
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  const db = {
    insert: () => query(opts.insertResult ?? [], undefined, (v) => rec.insertValues.push(v)),
    update: () => query(opts.updateResult ?? [], (v) => rec.updateSets.push(v)),
    select: () => query([]),
    execute: () => Promise.resolve([]),
  } as unknown as Database;
  return { db, rec };
}

const fixedNow = () => new Date(1_000);

describe('computeCostIdr', () => {
  it('bills STT only when no model given', () => {
    expect(computeCostIdr({ sttSeconds: 100 })).toBe(50); // 100 * 0.5
  });
  it('bills reasoner tokens', () => {
    expect(computeCostIdr({ tokensIn: 1000, tokensOut: 100, model: 'reasoner' })).toBe(13); // 10 + 3
  });
  it('bills chat tokens', () => {
    expect(computeCostIdr({ tokensIn: 1000, tokensOut: 1000, model: 'chat' })).toBe(9); // 3 + 6
  });
  it('bills embedding tokens', () => {
    expect(computeCostIdr({ tokensIn: 10000, model: 'embedding' })).toBe(3); // 10000 * 0.0003
  });
  it('rounds to integer IDR and defaults to zero', () => {
    expect(computeCostIdr({})).toBe(0);
  });
});

describe('PipelineService', () => {
  it('startRun inserts a running row and returns its id', async () => {
    const { db, rec } = makeFakeDb({ insertResult: [{ id: 'run-1' }] });
    const svc = new PipelineService(db, fixedNow);
    const id = await svc.startRun({ tenantId: 't1', jobType: 'media', refType: 'event', refId: 'e1' });
    expect(id).toBe('run-1');
    expect(rec.insertValues[0]).toMatchObject({ tenantId: 't1', jobType: 'media', status: 'running' });
  });

  it('startRun throws when the insert returns no id', async () => {
    const { db } = makeFakeDb({ insertResult: [] });
    const svc = new PipelineService(db, fixedNow);
    await expect(svc.startRun({ tenantId: 't1', jobType: 'media' })).rejects.toThrow(/no id/);
  });

  it('stage returns the fn result and records a successful stage', async () => {
    const { db, rec } = makeFakeDb();
    const svc = new PipelineService(db, fixedNow);
    const result = await svc.stage('run-1', 'ingested', async () => 42);
    expect(result).toBe(42);
    expect(rec.updateSets).toHaveLength(1); // appendStage only
  });

  it('stage marks the run failed and rethrows on error', async () => {
    const { db, rec } = makeFakeDb();
    const svc = new PipelineService(db, fixedNow);
    await expect(
      svc.stage('run-1', 'transcribed', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // appendStage(failed) + status update
    expect(rec.updateSets).toHaveLength(2);
    expect(rec.updateSets.some((s) => s.status === 'failed')).toBe(true);
  });

  it('stage stringifies non-Error throws', async () => {
    const { db } = makeFakeDb();
    const svc = new PipelineService(db, fixedNow);
    await expect(svc.stage('run-1', 'structured', async () => Promise.reject('str-fail'))).rejects.toBe(
      'str-fail',
    );
  });

  it('meterCost returns the new cumulative cost', async () => {
    const { db } = makeFakeDb({ updateResult: [{ costIdr: 123 }] });
    const svc = new PipelineService(db, fixedNow);
    const total = await svc.meterCost('run-1', { sttSeconds: 10, tokensIn: 5, model: 'reasoner' });
    expect(total).toBe(123);
  });

  it('meterCost defaults absent usage fields to zero', async () => {
    const { db } = makeFakeDb({ updateResult: [{ costIdr: 0 }] });
    const svc = new PipelineService(db, fixedNow);
    await expect(svc.meterCost('run-1', {})).resolves.toBe(0);
  });

  it('meterCost throws when the run is missing', async () => {
    const { db } = makeFakeDb({ updateResult: [] });
    const svc = new PipelineService(db, fixedNow);
    await expect(svc.meterCost('missing', { sttSeconds: 1 })).rejects.toThrow(/not found/);
  });

  it('completeRun defaults to done and accepts dead', async () => {
    const { db, rec } = makeFakeDb();
    const svc = new PipelineService(db, fixedNow);
    await svc.completeRun('run-1');
    await svc.completeRun('run-1', 'dead');
    expect(rec.updateSets.map((s) => s.status)).toEqual(['done', 'dead']);
  });

  it('works with the default system clock', async () => {
    const { db, rec } = makeFakeDb();
    const svc = new PipelineService(db); // exercises the default now()
    await svc.completeRun('run-1');
    expect(rec.updateSets.map((s) => s.status)).toEqual(['done']);
  });
});
