import { describe, expect, it } from 'vitest';

import { msToPx, pxToMs, topicSpan } from './scrubber';

describe('topicSpan', () => {
  it('maps a topic to left/width percentages of the total', () => {
    expect(topicSpan(0, 15_000, 30_000)).toEqual({ leftPct: 0, widthPct: 50 });
    expect(topicSpan(15_000, 30_000, 30_000)).toEqual({ leftPct: 50, widthPct: 50 });
  });
  it('clamps out-of-range topics to the bar', () => {
    expect(topicSpan(-5_000, 45_000, 30_000)).toEqual({ leftPct: 0, widthPct: 100 });
  });
  it('returns zeros when total is non-positive', () => {
    expect(topicSpan(0, 10, 0)).toEqual({ leftPct: 0, widthPct: 0 });
  });
});

describe('pxToMs / msToPx round-trip', () => {
  it('converts a click px offset to ms', () => {
    expect(pxToMs(300, 600, 30_000)).toBe(15_000); // halfway
    expect(pxToMs(0, 600, 30_000)).toBe(0);
    expect(pxToMs(900, 600, 30_000)).toBe(30_000); // clamped past the end
  });
  it('converts ms to a px offset', () => {
    expect(msToPx(15_000, 600, 30_000)).toBe(300);
    expect(msToPx(0, 600, 30_000)).toBe(0);
  });
  it('guards zero widths / totals', () => {
    expect(pxToMs(100, 0, 30_000)).toBe(0);
    expect(msToPx(100, 600, 0)).toBe(0);
  });
});
