import { readFileSync } from 'node:fs';

import type { StructuringOutput } from '@recall/shared';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { meetings, tasks } from '../db/schema';
import type { LlmClient } from './llm/types';
import { StructuringService, type StructuringDeps } from './structuring.service';

const expected = JSON.parse(
  readFileSync(new URL('../../../../fixtures/structuring/mixed-id-en-30s.expected.json', import.meta.url), 'utf8'),
) as StructuringOutput;
const transcript = JSON.parse(
  readFileSync(new URL('../../../../fixtures/structuring/mixed-id-en-30s.transcript.json', import.meta.url), 'utf8'),
) as { language: string; segments: unknown[] };

interface Capture {
  meeting?: Record<string, unknown>;
  tasks: Record<string, unknown>[];
}

function makeDb(capture: Capture): Database {
  const make = (result: unknown[], onValues?: (v: Record<string, unknown>) => void) => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.returning = () => q;
    q.values = (v: Record<string, unknown>) => (onValues?.(v), q);
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    select: () => make([{ language: transcript.language, segments: transcript.segments }]),
    insert: (table: unknown) =>
      table === meetings
        ? make([{ id: 'm1' }], (v) => (capture.meeting = v))
        : table === tasks
          ? make([{ id: 'task' }], (v) => capture.tasks.push(v))
          : make([]),
  } as unknown as Database;
}

function makeDeps(capture: Capture): StructuringDeps {
  return {
    db: makeDb(capture),
    llm: {
      chat: vi.fn(async () => ({
        content: JSON.stringify(expected),
        modelId: 'deepseek-reasoner',
        usage: { promptTokens: 1200, completionTokens: 400 },
        latencyMs: 5,
      })),
    } as LlmClient,
    pipeline: {
      stage: vi.fn(async (_r: string, _n: string, fn: () => Promise<unknown>) => fn()),
      meterCost: vi.fn(async () => 0),
    } as unknown as StructuringDeps['pipeline'],
  };
}

const job = {
  tenantId: 't1',
  eventId: 'e1',
  transcriptId: 'tr1',
  runId: 'run-1',
  occurredAt: new Date('2026-07-20T03:00:00Z'),
};

describe('StructuringService.structure (golden)', () => {
  it('persists a meeting matching the golden shape and a task per action', async () => {
    const capture: Capture = { tasks: [] };
    const result = await new StructuringService(makeDeps(capture)).structure(job);

    expect(result).toEqual({ meetingId: 'm1' });
    expect(capture.meeting?.title).toBe(expected.topics[0]!.title);
    expect((capture.meeting?.topics as unknown[]).length).toBe(expected.topics.length);
    expect(capture.meeting?.attributionConfidence).toBe(expected.attributionConfidence);
    // one task row per extracted action, EN-normalized
    expect(capture.tasks).toHaveLength(expected.actions.length);
    expect(capture.tasks[0]).toMatchObject({ title: expected.actions[0]!.title, normalizedLang: 'en' });
  });

  it('meters DeepSeek tokens for the run', async () => {
    const capture: Capture = { tasks: [] };
    const deps = makeDeps(capture);
    await new StructuringService(deps).structure(job);
    expect(deps.pipeline.meterCost).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ tokensIn: 1200, tokensOut: 400, model: 'reasoner' }),
    );
  });
});
