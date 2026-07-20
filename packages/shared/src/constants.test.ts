import { describe, expect, it } from 'vitest';

import {
  ENTITY_KINDS,
  QUEUE_NAMES,
  QUEUES,
  RELATION_TYPES,
  STAGES,
} from './constants';
import { entityKindSchema, relationTypeSchema } from './schemas/index';

describe('shared vocabularies', () => {
  it('exposes every declared queue as a name', () => {
    expect(QUEUE_NAMES).toEqual(Object.values(QUEUES));
    expect(QUEUE_NAMES).toContain('transcription');
  });

  it('keeps the pipeline stage order authoritative', () => {
    expect(STAGES[0]).toBe('ingested');
    expect(STAGES.at(-1)).toBe('notified'); // terminal stage
    expect(STAGES).toContain('persisted');
  });

  it('derives zod enums from the same const vocabularies', () => {
    for (const kind of ENTITY_KINDS) {
      expect(entityKindSchema.parse(kind)).toBe(kind);
    }
    for (const relation of RELATION_TYPES) {
      expect(relationTypeSchema.parse(relation)).toBe(relation);
    }
    expect(() => entityKindSchema.parse('alien')).toThrow();
  });
});
