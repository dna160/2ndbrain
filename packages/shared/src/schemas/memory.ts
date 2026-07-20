/** Memory contracts (docs/00 F4, docs/04 §3). Consolidation output + graph/review DTOs. */
import { z } from 'zod';

import { ENTITY_KINDS, RELATION_TYPES } from '../constants';

const entityKind = z.enum(ENTITY_KINDS);
const relationType = z.enum(RELATION_TYPES);

// ── Consolidation LLM output ──────────────────────────────────────────────────
export const entityRefSchema = z.object({
  id: z.string().optional(),
  newEntity: z.object({ kind: entityKind, name: z.string().min(1) }).optional(),
});

export const consolidationFactSchema = z.object({
  content: z.string().min(1),
  entityRefs: z.array(entityRefSchema),
  confidence: z.number().min(0).max(1),
  sourceEventIds: z.array(z.string()).min(1), // provenance is non-negotiable
  sensitivity: z.enum(['normal', 'sensitive']).default('normal'),
});

export const consolidationRelationSchema = z.object({
  fromRef: entityRefSchema,
  toRef: entityRefSchema,
  relation: relationType,
  strengthDelta: z.number().min(0).max(1),
  sourceEventIds: z.array(z.string()).min(1),
});

export const consolidationOutputSchema = z.object({
  facts: z.array(consolidationFactSchema),
  relations: z.array(consolidationRelationSchema),
  contradictions: z.array(z.object({ memoryId: z.string(), conflict: z.string() })),
  coreNominations: z.array(z.string()),
});
export type ConsolidationOutput = z.infer<typeof consolidationOutputSchema>;

// ── API DTOs ──────────────────────────────────────────────────────────────────
export const entityCardSchema = z.object({
  id: z.string().uuid(),
  kind: entityKind,
  name: z.string(),
  aka: z.array(z.string()),
  salience: z.number(),
  sensitivity: z.enum(['normal', 'sensitive']),
  isCore: z.boolean(),
});
export type EntityCard = z.infer<typeof entityCardSchema>;

export const memoryDtoSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  confidence: z.number(),
  salience: z.number(),
  sensitivity: z.enum(['normal', 'sensitive']),
  status: z.enum(['active', 'review', 'archived']),
  provenanceEventIds: z.array(z.string()),
});
export type MemoryDto = z.infer<typeof memoryDtoSchema>;

export const memoryReviewDtoSchema = z.object({
  id: z.string().uuid(),
  memoryId: z.string().uuid(),
  reason: z.enum(['low_confidence', 'contradiction', 't3_nomination']),
  memoryContent: z.string(),
});
export type MemoryReviewDto = z.infer<typeof memoryReviewDtoSchema>;

export const resolveReviewRequestSchema = z.object({
  resolution: z.enum(['approved', 'edited', 'rejected']),
  content: z.string().optional(),
});
export type ResolveReviewRequest = z.infer<typeof resolveReviewRequestSchema>;

export const graphSchema = z.object({
  nodes: z.array(z.object({ id: z.string().uuid(), name: z.string(), kind: entityKind, salience: z.number() })),
  edges: z.array(
    z.object({ fromId: z.string().uuid(), toId: z.string().uuid(), relation: relationType, strength: z.number() }),
  ),
});
export type Graph = z.infer<typeof graphSchema>;
