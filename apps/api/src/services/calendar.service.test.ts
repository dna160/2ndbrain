import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';
import { calendarDrafts, connectedAccounts } from '../db/schema';
import { CalendarService, detectConflicts, type CalendarDeps } from './calendar.service';
import type { GoogleCalendarClient } from './google/calendar.client';

type Draft = { id: string; tenantId: string; action: string; status: string; payload: Record<string, unknown> };

function makeDb(cfg: { draft?: Draft | null; syncCursor?: string | null }): Database {
  const make = (initial: unknown[]) => {
    let result = initial;
    const q: Record<string, unknown> = {};
    q.from = (table: unknown) => {
      if (table === calendarDrafts) result = cfg.draft ? [cfg.draft] : [];
      else if (table === connectedAccounts) result = [{ syncCursor: cfg.syncCursor ?? null }];
      return q;
    };
    for (const m of ['where', 'limit', 'orderBy', 'values', 'set', 'onConflictDoUpdate', 'returning']) {
      q[m] = () => q;
    }
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    select: () => make([]),
    insert: () => make([{ id: 'draft-new' }]),
    update: () => make([]),
  } as unknown as Database;
}

function client(): GoogleCalendarClient & {
  list: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    list: vi.fn(async () => ({ events: [], nextSyncToken: 'tok' })),
    insert: vi.fn(async () => ({ id: 'gcal1' })),
    patch: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

const now = () => new Date(0);
const svc = (deps: Partial<CalendarDeps> & { client: GoogleCalendarClient; db: Database }) =>
  new CalendarService({ now, ...deps });

const d = new Date('2026-07-20T03:00:00Z');
const later = new Date('2026-07-20T04:00:00Z');

describe('detectConflicts', () => {
  it('flags overlapping events both ways', () => {
    const conflicts = detectConflicts([
      { id: 'a', title: 'A', startAt: d, endAt: later },
      { id: 'b', title: 'B', startAt: new Date('2026-07-20T03:30:00Z'), endAt: new Date('2026-07-20T04:30:00Z') },
    ]);
    expect(conflicts.get('a')).toBe('B');
    expect(conflicts.get('b')).toBe('A');
  });
  it('does not flag disjoint events', () => {
    const conflicts = detectConflicts([
      { id: 'a', title: 'A', startAt: d, endAt: later },
      { id: 'b', title: 'B', startAt: new Date('2026-07-20T05:00:00Z'), endAt: new Date('2026-07-20T06:00:00Z') },
    ]);
    expect(conflicts.size).toBe(0);
  });
});

describe('CalendarService — draft-gated writes', () => {
  it('confirmDraft(create) inserts into Google Calendar', async () => {
    const c = client();
    await svc({ db: makeDb({ draft: { id: 'd1', tenantId: 't1', action: 'create', status: 'proposed', payload: { summary: 'X', startISO: d.toISOString(), endISO: later.toISOString() } } }), client: c }).confirmDraft('t1', 'd1');
    expect(c.insert).toHaveBeenCalledOnce();
    expect(c.patch).not.toHaveBeenCalled();
  });

  it('confirmDraft(update) patches', async () => {
    const c = client();
    await svc({ db: makeDb({ draft: { id: 'd1', tenantId: 't1', action: 'update', status: 'proposed', payload: { gcalId: 'g1' } } }), client: c }).confirmDraft('t1', 'd1');
    expect(c.patch).toHaveBeenCalledOnce();
  });

  it('confirmDraft(cancel) removes', async () => {
    const c = client();
    await svc({ db: makeDb({ draft: { id: 'd1', tenantId: 't1', action: 'cancel', status: 'proposed', payload: { gcalId: 'g1' } } }), client: c }).confirmDraft('t1', 'd1');
    expect(c.remove).toHaveBeenCalledOnce();
  });

  it('confirmDraft throws when the draft is not proposed', async () => {
    const c = client();
    await expect(
      svc({ db: makeDb({ draft: { id: 'd1', tenantId: 't1', action: 'create', status: 'confirmed', payload: {} } }), client: c }).confirmDraft('t1', 'd1'),
    ).rejects.toThrow(/not proposed/);
  });

  it('proves there is NO direct-write path — sync/createDraft/rejectDraft never touch the client', async () => {
    const c = client();
    const service = svc({ db: makeDb({ syncCursor: null }), client: c });
    await service.sync('t1', 'acc1');
    await service.createDraft('t1', { action: 'create', payload: {}, sourceType: 'manual' });
    await service.rejectDraft('t1', 'd1');
    expect(c.insert).not.toHaveBeenCalled();
    expect(c.patch).not.toHaveBeenCalled();
    expect(c.remove).not.toHaveBeenCalled();
    expect(c.list).toHaveBeenCalled(); // sync only reads
  });
});
