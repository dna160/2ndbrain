/**
 * Three-tier graph memory (docs/00 F4, docs/01 §4).
 * T2 = entities + typed weighted entityLinks + atomic memories (pgvector embeddings).
 * T3 = coreMemories (always injected) + entities.isCore.
 * Embedding dimension is 1024 (BGE-M3 self-hosted — product-owner decision, Phase 0 review).
 * Provenance is non-negotiable: every memory + link carries provenanceEventIds.
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { idColumn, tenantIdColumn, timestamps } from './_columns';
import {
  entityKindEnum,
  memoryReviewReasonEnum,
  memoryReviewResolutionEnum,
  memoryStatusEnum,
  relationTypeEnum,
  sensitivityEnum,
} from './_enums';

/** BGE-M3 embedding dimension. */
export const EMBEDDING_DIM = 1024;

export const entities = pgTable(
  'entities',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    kind: entityKindEnum('kind').notNull(),
    name: text('name').notNull(),
    aka: jsonb('aka').$type<string[]>().notNull().default([]),
    profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
    salience: real('salience').notNull().default(0.5),
    sensitivity: sensitivityEnum('sensitivity').notNull().default('normal'),
    isCore: boolean('is_core').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index('entities_tenant_id_idx').on(t.tenantId),
    index('entities_kind_idx').on(t.tenantId, t.kind),
  ],
);

export const entityLinks = pgTable(
  'entity_links',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    fromId: uuid('from_id')
      .notNull()
      .references(() => entities.id),
    toId: uuid('to_id')
      .notNull()
      .references(() => entities.id),
    relation: relationTypeEnum('relation').notNull(),
    strength: real('strength').notNull().default(0.5),
    provenanceEventIds: jsonb('provenance_event_ids').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('entity_links_from_to_relation_uq').on(t.fromId, t.toId, t.relation),
    index('entity_links_tenant_id_idx').on(t.tenantId),
    index('entity_links_from_idx').on(t.fromId),
    index('entity_links_to_idx').on(t.toId),
  ],
);

export const memories = pgTable(
  'memories',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    content: text('content').notNull(),
    entityIds: jsonb('entity_ids').$type<string[]>().notNull().default([]),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    confidence: real('confidence').notNull().default(0.5),
    salience: real('salience').notNull().default(0.5),
    sensitivity: sensitivityEnum('sensitivity').notNull().default('normal'),
    status: memoryStatusEnum('status').notNull().default('active'),
    provenanceEventIds: jsonb('provenance_event_ids').$type<string[]>().notNull().default([]),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('memories_tenant_id_idx').on(t.tenantId),
    index('memories_status_idx').on(t.tenantId, t.status),
    // pgvector ANN index (cosine). ivfflat per docs/01 ADR-4; defaults lists=100.
    index('memories_embedding_idx').using('ivfflat', t.embedding.op('vector_cosine_ops')),
  ],
);

export const memoryReviews = pgTable(
  'memory_reviews',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    memoryId: uuid('memory_id')
      .notNull()
      .references(() => memories.id),
    reason: memoryReviewReasonEnum('reason').notNull(),
    resolution: memoryReviewResolutionEnum('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('memory_reviews_tenant_id_idx').on(t.tenantId),
    index('memory_reviews_unresolved_idx').on(t.tenantId, t.resolvedAt),
  ],
);

/** T3 permanent core memory — small, ordered, always injected into prompt context. */
export const coreMemories = pgTable(
  'core_memories',
  {
    id: idColumn(),
    tenantId: tenantIdColumn(),
    content: text('content').notNull(),
    position: real('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('core_memories_tenant_id_position_idx').on(t.tenantId, t.position)],
);
