import { describe, expect, it } from 'vitest';

import { classifyDedupe, cosineSimilarity, decaySalience, emaMerge, needsReview } from './math';

describe('emaMerge', () => {
  it('blends prev and next by alpha', () => {
    expect(emaMerge(0.5, 1, 0.3)).toBeCloseTo(0.65);
    expect(emaMerge(0.5, 0.5)).toBeCloseTo(0.5);
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });
  it('is 0 for empty, length-mismatched, or zero vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('classifyDedupe', () => {
  it('merges at ≥0.88', () => {
    expect(classifyDedupe(0.9, false)).toBe('merge');
  });
  it('flags a contradiction in 0.75-0.88 when contradicting', () => {
    expect(classifyDedupe(0.8, true)).toBe('contradiction');
  });
  it('inserts otherwise', () => {
    expect(classifyDedupe(0.8, false)).toBe('insert');
    expect(classifyDedupe(0.5, true)).toBe('insert');
  });
});

describe('decaySalience', () => {
  it('applies the daily factor', () => {
    expect(decaySalience(0.5)).toBeCloseTo(0.49);
  });
  it('respects the floor', () => {
    expect(decaySalience(0.05)).toBe(0.05);
    expect(decaySalience(0.01)).toBe(0.05);
  });
});

describe('needsReview', () => {
  it('flags confidence below 0.6', () => {
    expect(needsReview(0.4)).toBe(true);
    expect(needsReview(0.6)).toBe(false);
  });
});
