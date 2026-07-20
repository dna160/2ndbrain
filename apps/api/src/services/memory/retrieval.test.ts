import { describe, expect, it } from 'vitest';

import { rankMemories } from './retrieval.service';

const now = new Date('2026-07-20T00:00:00Z');
const day = 86_400_000;

describe('rankMemories', () => {
  it('is deterministic and score-dominated for same-age items', () => {
    const items = [
      { id: 'a', score: 0.9, createdAt: new Date(now.getTime() - day) },
      { id: 'b', score: 0.5, createdAt: new Date(now.getTime() - day) },
      { id: 'c', score: 0.7, createdAt: new Date(now.getTime() - day) },
    ];
    expect(rankMemories(items, now).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    // stable across runs
    expect(rankMemories(items, now).map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties by id', () => {
    const items = [
      { id: 'z', score: 0.5, createdAt: now },
      { id: 'a', score: 0.5, createdAt: now },
    ];
    expect(rankMemories(items, now).map((i) => i.id)).toEqual(['a', 'z']);
  });

  it('rewards recency when scores are equal', () => {
    const items = [
      { id: 'old', score: 0.5, createdAt: new Date(now.getTime() - 100 * day) },
      { id: 'new', score: 0.5, createdAt: now },
    ];
    expect(rankMemories(items, now)[0]!.id).toBe('new');
  });
});
