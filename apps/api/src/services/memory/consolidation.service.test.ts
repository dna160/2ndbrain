import type { ConsolidationOutput } from '@recall/shared';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../db/client';
import { memories, memoryReviews } from '../../db/schema';
import { ConsolidationService, type ConsolidationDeps } from './consolidation.service';

interface Rec {
  memoryInserts: Record<string, unknown>[];
  reviewInserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
}

function makeDb(rec: Rec): Database {
  const make = (result: unknown[], kind?: 'memories' | 'reviews') => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'returning', 'innerJoin']) q[m] = () => q;
    q.set = (v: Record<string, unknown>) => {
      rec.updates.push(v);
      return q;
    };
    q.values = (v: Record<string, unknown>) => {
      if (kind === 'memories') rec.memoryInserts.push(v);
      else if (kind === 'reviews') rec.reviewInserts.push(v);
      return q;
    };
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    select: () => make([]), // empty day/roster/existing → every fact takes the insert path
    insert: (table: unknown) =>
      table === memories
        ? make([{ id: 'mem1' }], 'memories')
        : table === memoryReviews
          ? make([{ id: 'rev1' }], 'reviews')
          : make([]),
    update: () => make([]),
  } as unknown as Database;
}

const output: ConsolidationOutput = {
  facts: [
    { content: 'Budi runs procurement at Genchai', entityRefs: [], confidence: 0.4, sourceEventIds: ['e1'], sensitivity: 'normal' },
  ],
  relations: [
    {
      fromRef: { newEntity: { kind: 'person', name: 'Budi' } },
      toRef: { newEntity: { kind: 'org', name: 'Genchai' } },
      relation: 'works_at',
      strengthDelta: 0.5,
      sourceEventIds: ['e1'],
    },
  ],
  contradictions: [{ memoryId: '11111111-1111-1111-1111-111111111111', conflict: 'price changed' }],
  coreNominations: [],
};

function deps(rec: Rec): ConsolidationDeps & {
  upsertLink: ReturnType<typeof vi.fn>;
} {
  const upsertLink = vi.fn(async () => undefined);
  return {
    db: makeDb(rec),
    llm: { chat: vi.fn(async () => ({ content: JSON.stringify(output), modelId: 'deepseek-reasoner', usage: { promptTokens: 10, completionTokens: 5 }, latencyMs: 1 })) },
    embeddings: { embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])) },
    graph: { resolveOrCreateEntity: vi.fn(async () => 'ent'), upsertLink },
    now: () => new Date(0),
    upsertLink,
  };
}

describe('ConsolidationService.consolidate', () => {
  it('inserts low-confidence facts to review, sends contradictions to review, and links relations', async () => {
    const rec: Rec = { memoryInserts: [], reviewInserts: [], updates: [] };
    const d = deps(rec);
    const result = await new ConsolidationService(d).consolidate('t1');

    expect(result).toMatchObject({ inserted: 1, merged: 0 });
    // low-confidence fact → memory inserted as review, WITH provenance (non-negotiable)
    expect(rec.memoryInserts[0]).toMatchObject({ status: 'review', provenanceEventIds: ['e1'] });
    // reviews: one low_confidence + one contradiction
    const reasons = rec.reviewInserts.map((r) => r.reason);
    expect(reasons).toContain('low_confidence');
    expect(reasons).toContain('contradiction');
    // contradiction also flips the referenced memory to review status
    expect(rec.updates.some((u) => u.status === 'review')).toBe(true);
    // relation applied to the graph with provenance
    expect(d.upsertLink).toHaveBeenCalledWith('t1', 'ent', 'ent', 'works_at', 0.5, ['e1']);
  });
});
