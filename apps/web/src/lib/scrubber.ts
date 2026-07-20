/** Topic Scrubber px↔ms math (docs/02 §1 signature element). Pure — unit tested. */

/** A topic's position on the bar, as percentages of total duration. */
export function topicSpan(
  startMs: number,
  endMs: number,
  totalMs: number,
): { leftPct: number; widthPct: number } {
  if (totalMs <= 0) return { leftPct: 0, widthPct: 0 };
  const clampedStart = Math.max(0, Math.min(startMs, totalMs));
  const clampedEnd = Math.max(clampedStart, Math.min(endMs, totalMs));
  return {
    leftPct: (clampedStart / totalMs) * 100,
    widthPct: ((clampedEnd - clampedStart) / totalMs) * 100,
  };
}

/** Click x-offset (px) within a bar of widthPx → ms position. */
export function pxToMs(px: number, widthPx: number, totalMs: number): number {
  if (widthPx <= 0) return 0;
  const ratio = Math.max(0, Math.min(px / widthPx, 1));
  return Math.round(ratio * totalMs);
}

/** ms → x-offset (px) within a bar of widthPx (playhead position). */
export function msToPx(ms: number, widthPx: number, totalMs: number): number {
  if (totalMs <= 0) return 0;
  const ratio = Math.max(0, Math.min(ms / totalMs, 1));
  return ratio * widthPx;
}
