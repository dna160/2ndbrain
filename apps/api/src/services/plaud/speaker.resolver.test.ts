import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../db/client';
import { calendarEvents, speakerAliases } from '../../db/schema';
import { distinctSpeakers, SpeakerResolver } from './speaker.resolver';

/** Table-dispatch fake: select().from(T) resolves the configured rows for T. */
function fakeDb(rows: { table: unknown; rows: unknown[] }[]): Database {
  return {
    select: () => {
      const q: Record<string, unknown> = {};
      let table: unknown;
      q.from = (t: unknown) => {
        table = t;
        return q;
      };
      q.where = () => q;
      q.limit = () => q;
      q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(rows.find((r) => r.table === table)?.rows ?? []).then(res, rej);
      return q;
    },
  } as unknown as Database;
}

describe('distinctSpeakers', () => {
  it('returns labels in first-appearance order, deduped', () => {
    expect(
      distinctSpeakers([
        { speakerKey: 'Speaker 1' },
        { speakerKey: 'Speaker 2' },
        { speakerKey: 'Speaker 1' },
        { speakerKey: 'Speaker 3' },
      ]),
    ).toEqual(['Speaker 1', 'Speaker 2', 'Speaker 3']);
  });
});

describe('SpeakerResolver.resolveParticipants', () => {
  it('auto-confirms speakers with a known alias, leaves the rest unconfirmed', async () => {
    const db = fakeDb([
      { table: speakerAliases, rows: [{ speakerLabel: 'Speaker 1', contactId: 'ent-budi' }] },
    ]);
    const parts = await new SpeakerResolver(db).resolveParticipants('t1', 'SN1', ['Speaker 1', 'Speaker 2']);
    expect(parts[0]).toEqual({ speakerKey: 'Speaker 1', entityId: 'ent-budi', confirmed: true, confidence: 1 });
    // No alias → unconfirmed, no guessed identity (honest over wrong).
    expect(parts[1]).toEqual({ speakerKey: 'Speaker 2', confirmed: false, confidence: 0 });
  });

  it('skips the alias lookup entirely when the recording has no device serial', async () => {
    const select = vi.fn();
    const db = { select } as unknown as Database;
    const parts = await new SpeakerResolver(db).resolveParticipants('t1', null, ['Speaker 1']);
    expect(select).not.toHaveBeenCalled();
    expect(parts[0]?.confirmed).toBe(false);
  });
});

describe('SpeakerResolver.matchCalendarEvent', () => {
  it('returns null when the recording has no start time', async () => {
    expect(await new SpeakerResolver(fakeDb([])).matchCalendarEvent('t1', null)).toBeNull();
  });

  it('returns a calendar event id within the ±15 min window', async () => {
    const db = fakeDb([{ table: calendarEvents, rows: [{ id: 'evt-1' }] }]);
    expect(await new SpeakerResolver(db).matchCalendarEvent('t1', new Date('2026-08-08T05:00:00Z'))).toBe('evt-1');
  });

  it('returns null when nothing is in the window', async () => {
    expect(await new SpeakerResolver(fakeDb([])).matchCalendarEvent('t1', new Date())).toBeNull();
  });
});
