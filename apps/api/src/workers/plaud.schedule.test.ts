import { describe, expect, it } from 'vitest';

import { plaudSyncJobsFor } from './plaud.schedule';

const now = new Date('2026-08-08T10:00:00Z');
const at = (iso: string) => new Date(iso);

describe('plaudSyncJobsFor', () => {
  it('schedules a pre-event guard 20 min before start', () => {
    const jobs = plaudSyncJobsFor(
      [{ gcalId: 'g1', startAt: at('2026-08-08T11:00:00Z'), endAt: at('2026-08-08T11:30:00Z') }],
      now,
    );
    const pre = jobs.find((j) => j.jobId === 'plaud-pre-g1');
    // 11:00 - 20min = 10:40; from 10:00 that's 40 min.
    expect(pre?.delayMs).toBe(40 * 60_000);
  });

  it('schedules 15-min bursts across the 120-min post-meeting window, dropping past firings', () => {
    const jobs = plaudSyncJobsFor(
      [{ gcalId: 'g1', startAt: at('2026-08-08T09:00:00Z'), endAt: at('2026-08-08T09:30:00Z') }],
      now,
    );
    const bursts = jobs.filter((j) => j.jobId.startsWith('plaud-burst-g1-'));
    // Full window is n=0..8 (9 firings at 09:30..11:30); 09:30 and 09:45 are before now 10:00
    // and are dropped, leaving n=2..8 = 7.
    expect(bursts).toHaveLength(7);
    expect(bursts.every((b) => b.delayMs >= 0)).toBe(true);
    expect(bursts.some((b) => b.jobId === 'plaud-burst-g1-8')).toBe(true); // last firing kept
  });

  it('keeps all 9 bursts when the meeting ends at now', () => {
    const jobs = plaudSyncJobsFor(
      [{ gcalId: 'g1', startAt: at('2026-08-08T09:30:00Z'), endAt: now }],
      now,
    );
    expect(jobs.filter((j) => j.jobId.startsWith('plaud-burst-g1-'))).toHaveLength(9);
  });

  it('drops firings already in the past (never schedules a sync backwards)', () => {
    const jobs = plaudSyncJobsFor(
      [{ gcalId: 'past', startAt: at('2026-08-08T08:00:00Z'), endAt: at('2026-08-08T08:10:00Z') }],
      now,
    );
    // start 08:00 and its whole +120m burst window (ends 10:10) — only bursts after 10:00 survive.
    expect(jobs.find((j) => j.jobId === 'plaud-pre-past')).toBeUndefined();
    expect(jobs.every((j) => j.delayMs >= 0)).toBe(true);
  });

  it('uses deterministic jobIds so re-ticks dedupe rather than pile up', () => {
    const evs = [{ gcalId: 'g1', startAt: at('2026-08-08T12:00:00Z'), endAt: at('2026-08-08T12:30:00Z') }];
    const a = plaudSyncJobsFor(evs, now).map((j) => j.jobId);
    const b = plaudSyncJobsFor(evs, now).map((j) => j.jobId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // no duplicate ids within a plan
  });

  it('returns nothing for no events', () => {
    expect(plaudSyncJobsFor([], now)).toEqual([]);
  });
});
