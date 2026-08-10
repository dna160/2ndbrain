/** WIB (Asia/Jakarta) rendering — store UTC, render WIB (CLAUDE.md). */
const TZ = 'Asia/Jakarta';

export function timeWIB(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

export function dateWIB(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: TZ }).format(
    new Date(iso),
  );
}

/** Jakarta calendar day (YYYY-MM-DD) for an ISO instant — so "today" is WIB, not UTC. */
export function dayKeyWIB(iso: string | Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
}

/** Relative label for a near-future instant: "in 25m", "in 3h", "in 2d", or "now". */
export function relativeWIB(iso: string, from: Date = new Date()): string {
  const diffMin = Math.round((new Date(iso).getTime() - from.getTime()) / 60000);
  if (diffMin <= 0) return 'now';
  if (diffMin < 60) return `in ${diffMin}m`;
  if (diffMin < 60 * 24) return `in ${Math.round(diffMin / 60)}h`;
  return `in ${Math.round(diffMin / (60 * 24))}d`;
}

/** ms → m:ss for transcript gutters / scrubber. */
export function msToClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function idrFormat(idr: number): string {
  return `Rp${new Intl.NumberFormat('id-ID').format(idr)}`;
}
