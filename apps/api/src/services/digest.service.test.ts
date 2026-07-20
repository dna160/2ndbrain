import { digestOutputSchema, type DigestOutput } from '@recall/shared';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { digests } from '../db/schema';
import { DigestService, renderDigest, type DigestDeps } from './digest.service';

const output: DigestOutput = {
  happened: [{ text: 'Met Budi about supplier pricing', provenanceEventIds: ['e1'] }],
  commitmentsByMe: [{ text: 'Send proposal by Friday', provenanceEventIds: ['e2'] }],
  commitmentsToMe: [],
  conflicts: [],
  recommendations: [
    {
      kind: 'book',
      text: 'Book the supplier call',
      urgency: 2,
      provenanceEventIds: ['e1'],
      draftPayload: { title: 'Supplier call', startISO: '2026-07-21T02:00:00Z', endISO: '2026-07-21T03:00:00Z' },
    },
  ],
};

function makeDb(rec: { inserts: Record<string, unknown>[] }): Database {
  const make = (result: unknown[], table?: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'returning', 'onConflictDoUpdate', 'set']) q[m] = () => q;
    q.values = (v: Record<string, unknown>) => {
      if (table === digests) rec.inserts.push(v);
      return q;
    };
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    select: () => make([]),
    insert: (table: unknown) => make([{ id: 'dig1' }], table),
    update: () => make([]),
  } as unknown as Database;
}

function deps(delivery: 'sent' | 'template'): DigestDeps & { createDraft: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const createDraft = vi.fn(async () => ({ id: 'draft1' }));
  const send = vi.fn(async () => ({ messageId: 'm1', delivery, windowOpen: delivery === 'sent' }));
  return {
    db: makeDb({ inserts: [] }),
    llm: { chat: vi.fn(async () => ({ content: JSON.stringify(output), modelId: 'deepseek-reasoner', usage: { promptTokens: 10, completionTokens: 5 }, latencyMs: 1 })) },
    retrieval: { contextFor: vi.fn(async () => 'memory ctx') },
    waSend: { send },
    calendar: { createDraft },
    operatorWaId: '628op',
    now: () => new Date('2026-07-20T14:00:00Z'),
    createDraft,
    send,
  };
}

describe('renderDigest', () => {
  it('renders the sections and caps length', () => {
    const text = renderDigest(output, '2026-07-20');
    expect(text).toContain('What happened');
    expect(text).toContain('• Met Budi about supplier pricing');
    expect(text).toContain('[book] Book the supplier call');
    const huge = { ...output, happened: Array.from({ length: 500 }, () => ({ text: 'x'.repeat(50), provenanceEventIds: ['e'] })) };
    expect(renderDigest(huge, '2026-07-20').length).toBeLessThanOrEqual(1600);
  });
});

describe('DigestService.run', () => {
  it('persists, sends free-form in-window, and drafts a booking recommendation', async () => {
    const d = deps('sent');
    const result = await new DigestService(d).run('t1');
    expect(result.deliveredVia).toBe('freeform');
    expect(d.send).toHaveBeenCalledWith('628op', expect.stringContaining('Recall digest'));
    expect(d.createDraft).toHaveBeenCalledWith('t1', expect.objectContaining({ action: 'create', sourceType: 'digest' }));
  });

  it('records template delivery out of window', async () => {
    const result = await new DigestService(deps('template')).run('t1');
    expect(result.deliveredVia).toBe('template');
  });
});

describe('digest provenance is non-negotiable', () => {
  it('rejects an item with no provenanceEventIds', () => {
    const bad = { ...output, happened: [{ text: 'unsourced', provenanceEventIds: [] }] };
    expect(digestOutputSchema.safeParse(bad).success).toBe(false);
  });
});
