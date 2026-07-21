import { describe, expect, it } from 'vitest';

import { digestOutputSchema, digestRecommendationSchema } from './digest';

const base = {
  kind: 'reply' as const,
  text: 'Reply to Budi about the runway question',
  urgency: 2,
  provenanceEventIds: ['e1'],
};

describe('digestRecommendationSchema draftPayload', () => {
  // Regression: the live nightly digest dead-lettered because DeepSeek emitted
  // `draftPayload: {}` on non-book recommendations and the required inner fields failed.
  it('accepts an empty draftPayload stub, treating it as absent', () => {
    const parsed = digestRecommendationSchema.parse({ ...base, draftPayload: {} });
    expect(parsed.draftPayload).toBeUndefined();
  });

  it('accepts a null draftPayload', () => {
    expect(digestRecommendationSchema.parse({ ...base, draftPayload: null }).draftPayload).toBeUndefined();
  });

  it('accepts an omitted draftPayload', () => {
    expect(digestRecommendationSchema.parse(base).draftPayload).toBeUndefined();
  });

  it('keeps a fully specified booking payload', () => {
    const parsed = digestRecommendationSchema.parse({
      ...base,
      kind: 'book',
      draftPayload: {
        title: 'Supplier call',
        startISO: '2026-07-22T02:00:00Z',
        endISO: '2026-07-22T03:00:00Z',
        attendees: ['budi@example.com'],
      },
    });
    expect(parsed.draftPayload?.title).toBe('Supplier call');
    expect(parsed.draftPayload?.attendees).toEqual(['budi@example.com']);
  });

  it('still rejects a half-filled booking payload', () => {
    // Only the fully-empty stub is forgiven; a partial payload is a real modelling error.
    expect(() =>
      digestRecommendationSchema.parse({ ...base, kind: 'book', draftPayload: { title: 'Only a title' } }),
    ).toThrow();
  });

  it('still requires provenance — an unsourced item does not exist', () => {
    expect(() => digestRecommendationSchema.parse({ ...base, provenanceEventIds: [] })).toThrow();
  });
});

describe('digestOutputSchema', () => {
  it('parses a full digest whose recommendations carry empty draftPayload stubs', () => {
    const out = digestOutputSchema.parse({
      happened: [{ text: 'Met the supplier', provenanceEventIds: ['e1'] }],
      commitmentsByMe: [],
      commitmentsToMe: [],
      conflicts: [],
      recommendations: [
        { ...base, draftPayload: {} },
        { ...base, kind: 'prepare', draftPayload: {} },
        { ...base, kind: 'decide' },
      ],
    });
    expect(out.recommendations).toHaveLength(3);
    expect(out.recommendations.every((r) => r.draftPayload === undefined)).toBe(true);
  });
});
