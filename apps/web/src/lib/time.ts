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

/** ms → m:ss for transcript gutters / scrubber. */
export function msToClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export function idrFormat(idr: number): string {
  return `Rp${new Intl.NumberFormat('id-ID').format(idr)}`;
}
