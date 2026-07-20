import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { events, waContacts } from '../db/schema';
import { ConversationsService } from './conversations.service';

const NOW = new Date(1_700_000_000_000);

interface Rec {
  updates: Record<string, unknown>[];
  deletes: number;
}

function makeDb(cfg: { botActiveUntil?: Date | null; insertId?: string }, rec: Rec): Database {
  const make = (initial: unknown[]) => {
    let result = initial;
    const q: Record<string, unknown> = {};
    q.from = (table: unknown) => {
      if (table === events) result = [{ mediaAssetId: null }];
      else if (table === waContacts) result = [{ botActiveUntil: cfg.botActiveUntil ?? null }];
      return q;
    };
    for (const m of ['where', 'limit', 'orderBy', 'returning', 'values']) q[m] = () => q;
    q.set = (v: Record<string, unknown>) => {
      rec.updates.push(v);
      return q;
    };
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    select: () => make([]),
    insert: () => make([{ id: cfg.insertId ?? 'ev1' }]),
    update: () => make([]),
    delete: () => {
      rec.deletes++;
      return make([]);
    },
  } as unknown as Database;
}

function deps(cfg: { botActiveUntil?: Date | null; insertId?: string }, rec: Rec, calls: string[]) {
  return {
    db: makeDb(cfg, rec),
    waSend: {
      send: vi.fn(async () => {
        calls.push('send');
        return { messageId: 'm1', delivery: 'sent' as const, windowOpen: true };
      }),
    },
    takeover: {
      pause: vi.fn(async () => {
        calls.push('pause');
      }),
      resume: vi.fn(async () => undefined),
    },
    now: () => NOW,
  };
}

describe('ConversationsService.reply', () => {
  it('requires confirmation before replying to a bot-active thread', async () => {
    const rec: Rec = { updates: [], deletes: 0 };
    const calls: string[] = [];
    const d = deps({ botActiveUntil: new Date(NOW.getTime() + 3600_000) }, rec, calls);
    const result = await new ConversationsService(d).reply('t1', '628a', 'hi', false);
    expect(result).toEqual({ needsConfirm: true });
    expect(d.waSend.send).not.toHaveBeenCalled();
  });

  it('pauses the bot BEFORE sending when takeover is confirmed', async () => {
    const rec: Rec = { updates: [], deletes: 0 };
    const calls: string[] = [];
    const d = deps({ botActiveUntil: new Date(NOW.getTime() + 3600_000), insertId: 'out1' }, rec, calls);
    const result = await new ConversationsService(d).reply('t1', '628a', 'hi', true);
    expect(calls).toEqual(['pause', 'send']); // ordering is the contract
    expect(result.eventId).toBe('out1');
  });

  it('sends and persists an outbound event on a non-bot thread', async () => {
    const rec: Rec = { updates: [], deletes: 0 };
    const calls: string[] = [];
    const d = deps({ botActiveUntil: null, insertId: 'out2' }, rec, calls);
    const result = await new ConversationsService(d).reply('t1', '628a', 'hi', false);
    expect(d.waSend.send).toHaveBeenCalledWith('628a', 'hi');
    expect(result).toMatchObject({ eventId: 'out2', delivery: 'sent', windowOpen: true });
  });
});

describe('ConversationsService.blockAndPurge (the only hard-delete path)', () => {
  it('deletes events and stamps purgedAt when purging', async () => {
    const rec: Rec = { updates: [], deletes: 0 };
    await new ConversationsService(deps({}, rec, [])).blockAndPurge('t1', '628a', true);
    expect(rec.deletes).toBeGreaterThanOrEqual(1);
    expect(rec.updates.some((u) => u.blocked === true && u.purgedAt !== null)).toBe(true);
  });

  it('blocks without deleting when purge is not requested', async () => {
    const rec: Rec = { updates: [], deletes: 0 };
    await new ConversationsService(deps({}, rec, [])).blockAndPurge('t1', '628a', false);
    expect(rec.deletes).toBe(0);
    expect(rec.updates.some((u) => u.blocked === true && u.purgedAt === null)).toBe(true);
  });
});
