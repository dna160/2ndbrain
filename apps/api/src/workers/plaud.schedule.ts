/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/workers/plaud.schedule.ts
 * Role    : Pure adaptive-polling planner (docs/05 §12.3). Given the upcoming calendar events
 *           and `now`, returns the one-off Plaud sync jobs to schedule: a forced sync 20 min
 *           before each event starts, and 15-min bursts for 120 min after each event ends. The
 *           2h base poll is a separate repeatable. Deterministic jobIds dedupe re-ticks.
 * Exports : plaudSyncJobsFor, PlaudScheduledJob
 */
export interface CalendarWindow {
  gcalId: string;
  startAt: Date;
  endAt: Date;
}

export interface PlaudScheduledJob {
  /** Deterministic so re-ticking the scheduler does not pile up duplicate jobs. */
  jobId: string;
  /** ms from `now` until the sync should run (never negative). */
  delayMs: number;
}

const MIN = 60_000;
const PRE_LEAD_MS = 20 * MIN;
const BURST_EVERY_MS = 15 * MIN;
const BURST_WINDOW_MS = 120 * MIN;

/**
 * Plan the adaptive syncs for a set of calendar windows. Only future firings are returned;
 * anything whose delay would be negative (already past) is dropped, so a stale event never
 * schedules a sync in the past.
 */
export function plaudSyncJobsFor(events: CalendarWindow[], now: Date): PlaudScheduledJob[] {
  const t = now.getTime();
  const jobs: PlaudScheduledJob[] = [];

  for (const ev of events) {
    // Pre-brief guard: one sync 20 min before start, so a brief never runs on stale state.
    const preDelay = ev.startAt.getTime() - PRE_LEAD_MS - t;
    if (preDelay >= 0) jobs.push({ jobId: `plaud-pre-${ev.gcalId}`, delayMs: preDelay });

    // Post-meeting burst: recordings land in Plaud minutes after a meeting ends.
    const end = ev.endAt.getTime();
    for (let n = 0; n * BURST_EVERY_MS <= BURST_WINDOW_MS; n++) {
      const fireAt = end + n * BURST_EVERY_MS;
      const delay = fireAt - t;
      if (delay >= 0) jobs.push({ jobId: `plaud-burst-${ev.gcalId}-${n}`, delayMs: delay });
    }
  }
  return jobs;
}
