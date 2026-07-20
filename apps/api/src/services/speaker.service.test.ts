import { describe, expect, it } from 'vitest';

import type { Database } from '../db/client';
import { SpeakerService, type SpeakerDeps } from './speaker.service';

interface Capture {
  updatedParticipants?: Array<{ speakerKey: string; entityId?: string; confirmed: boolean }>;
}

function makeDb(cfg: {
  meetingFound: boolean;
  entityId?: string;
  capture: Capture;
}): Database {
  const participants = [
    { speakerKey: 'S1', confirmed: false, confidence: 0.4 },
    { speakerKey: 'S2', confirmed: false, confidence: 0.5 },
  ];
  const make = (result: unknown[], onSet?: (v: Record<string, unknown>) => void) => {
    const q: Record<string, unknown> = {};
    q.from = () => q;
    q.where = () => q;
    q.returning = () => q;
    q.values = () => q;
    q.set = (v: Record<string, unknown>) => {
      onSet?.(v);
      return q;
    };
    q.then = (res: (x: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej);
    return q;
  };
  return {
    insert: () => make(cfg.entityId ? [{ id: cfg.entityId }] : []),
    select: () => make(cfg.meetingFound ? [{ participants }] : []),
    update: () =>
      make([], (v) => {
        cfg.capture.updatedParticipants = v.participants as Capture['updatedParticipants'];
      }),
  } as unknown as Database;
}

function svc(cfg: { meetingFound: boolean; entityId?: string; capture: Capture }): SpeakerService {
  return new SpeakerService({ db: makeDb(cfg), now: () => new Date(0) } as SpeakerDeps);
}

describe('SpeakerService.confirm', () => {
  it('links an existing entity and marks the participant confirmed', async () => {
    const capture: Capture = {};
    const result = await svc({ meetingFound: true, capture }).confirm('t1', 'm1', 'S1', {
      entityId: '11111111-1111-1111-1111-111111111111',
    });
    expect(result.entityId).toBe('11111111-1111-1111-1111-111111111111');
    const s1 = capture.updatedParticipants?.find((p) => p.speakerKey === 'S1');
    expect(s1).toMatchObject({ confirmed: true, entityId: '11111111-1111-1111-1111-111111111111' });
    // untouched participant stays unconfirmed
    expect(capture.updatedParticipants?.find((p) => p.speakerKey === 'S2')?.confirmed).toBe(false);
  });

  it('creates a new person entity when given a name', async () => {
    const capture: Capture = {};
    const result = await svc({ meetingFound: true, entityId: 'ent-new', capture }).confirm(
      't1',
      'm1',
      'S2',
      { newEntityName: 'Budi' },
    );
    expect(result.entityId).toBe('ent-new');
    expect(capture.updatedParticipants?.find((p) => p.speakerKey === 'S2')?.entityId).toBe('ent-new');
  });

  it('throws when the entity insert returns no id', async () => {
    await expect(
      svc({ meetingFound: true, capture: {} }).confirm('t1', 'm1', 'S1', { newEntityName: 'X' }),
    ).rejects.toThrow(/no id/);
  });

  it('throws when the meeting is not found', async () => {
    await expect(
      svc({ meetingFound: false, entityId: 'e', capture: {} }).confirm('t1', 'm404', 'S1', {
        entityId: '22222222-2222-2222-2222-222222222222',
      }),
    ).rejects.toThrow(/not found/);
  });
});
