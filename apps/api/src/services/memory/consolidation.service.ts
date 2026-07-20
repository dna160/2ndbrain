/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/memory/consolidation.service.ts
 * Role    : Nightly consolidation (docs/00 F4, docs/04 §3) — day's events → facts + relations
 *           (DeepSeek) → embedding dedupe (≥0.88 EMA-merge; else insert; <0.6 conf → review),
 *           contradictions → review (not active), relations → graph EMA links, salience decay.
 *           Every memory carries provenance (enforced). QC-gated write paths.
 * Exports : ConsolidationService
 */
import { consolidationOutputSchema, type ConsolidationOutput } from '@recall/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { entities, events, memories, memoryReviews } from '../../db/schema';
import { parseStructured } from '../llm/parse';
import { buildConsolidationUser, CONSOLIDATION_SYSTEM } from '../llm/prompts';
import type { LlmClient } from '../llm/types';
import type { EmbeddingsProvider } from './embeddings';
import type { GraphService } from './graph.service';
import { classifyDedupe, cosineSimilarity, emaMerge, needsReview } from './math';

type EntityRef = ConsolidationOutput['relations'][number]['fromRef'];

export interface ConsolidationDeps {
  db: Database;
  llm: LlmClient;
  embeddings: EmbeddingsProvider;
  graph: Pick<GraphService, 'resolveOrCreateEntity' | 'upsertLink'>;
  now?: () => Date;
}

export interface ConsolidationResult {
  inserted: number;
  merged: number;
  reviews: number;
}

export class ConsolidationService {
  private readonly now: () => Date;

  constructor(private readonly deps: ConsolidationDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async consolidate(tenantId: string): Promise<ConsolidationResult> {
    const since = new Date(this.now().getTime() - 24 * 3600 * 1000);
    const dayEvents = await this.deps.db
      .select({ id: events.id, content: events.content, occurredAt: events.occurredAt })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, since)));
    const roster = await this.deps.db
      .select({ id: entities.id, kind: entities.kind, name: entities.name })
      .from(entities)
      .where(eq(entities.tenantId, tenantId));
    const salient = await this.deps.db
      .select({ id: memories.id, content: memories.content })
      .from(memories)
      .where(and(eq(memories.tenantId, tenantId), eq(memories.status, 'active')))
      .orderBy(desc(memories.salience))
      .limit(50);

    const { data } = await parseStructured(this.deps.llm, {
      schema: consolidationOutputSchema,
      system: CONSOLIDATION_SYSTEM,
      user: buildConsolidationUser({
        events: dayEvents.map((e) => ({ id: e.id, content: e.content, occurredAt: e.occurredAt.toISOString() })),
        roster,
        memories: salient,
      }),
      model: 'deepseek-reasoner',
      temperature: 0.2,
    });

    const existing = await this.deps.db
      .select({
        id: memories.id,
        embedding: memories.embedding,
        confidence: memories.confidence,
        provenanceEventIds: memories.provenanceEventIds,
      })
      .from(memories)
      .where(and(eq(memories.tenantId, tenantId), eq(memories.status, 'active')));

    const factVectors = await this.deps.embeddings.embed(data.facts.map((f) => f.content));
    let inserted = 0;
    let merged = 0;
    let reviews = 0;

    for (let i = 0; i < data.facts.length; i++) {
      const fact = data.facts[i]!;
      const vector = factVectors[i];
      if (fact.sourceEventIds.length === 0 || !vector) continue; // provenance is non-negotiable

      let best: { sim: number; id: string; confidence: number; provenance: string[] } | null = null;
      for (const m of existing) {
        if (!m.embedding) continue;
        const sim = cosineSimilarity(vector, m.embedding);
        if (!best || sim > best.sim) {
          best = { sim, id: m.id, confidence: m.confidence, provenance: m.provenanceEventIds };
        }
      }

      if (best && classifyDedupe(best.sim, false) === 'merge') {
        await this.deps.db
          .update(memories)
          .set({
            confidence: emaMerge(best.confidence, fact.confidence),
            provenanceEventIds: [...new Set([...best.provenance, ...fact.sourceEventIds])],
            lastAccessedAt: this.now(),
            updatedAt: this.now(),
          })
          .where(eq(memories.id, best.id));
        merged++;
      } else {
        const status = needsReview(fact.confidence) ? 'review' : 'active';
        const rows = await this.deps.db
          .insert(memories)
          .values({
            tenantId,
            content: fact.content,
            embedding: vector,
            confidence: fact.confidence,
            sensitivity: fact.sensitivity,
            status,
            provenanceEventIds: fact.sourceEventIds,
          })
          .returning({ id: memories.id });
        inserted++;
        if (status === 'review' && rows[0]) {
          await this.deps.db.insert(memoryReviews).values({ tenantId, memoryId: rows[0].id, reason: 'low_confidence' });
          reviews++;
        }
      }
    }

    // Contradictions land in review, never silent-commit (docs/00 F4).
    for (const c of data.contradictions) {
      await this.deps.db.insert(memoryReviews).values({ tenantId, memoryId: c.memoryId, reason: 'contradiction' });
      await this.deps.db
        .update(memories)
        .set({ status: 'review', updatedAt: this.now() })
        .where(and(eq(memories.tenantId, tenantId), eq(memories.id, c.memoryId)));
      reviews++;
    }

    // Relations → typed graph links with provenance + strength EMA.
    for (const rel of data.relations) {
      const fromId = await this.resolveRef(tenantId, rel.fromRef);
      const toId = await this.resolveRef(tenantId, rel.toRef);
      if (fromId && toId) {
        await this.deps.graph.upsertLink(tenantId, fromId, toId, rel.relation, rel.strengthDelta, rel.sourceEventIds);
      }
    }

    // Salience decay on unaccessed active memories.
    await this.deps.db
      .update(memories)
      .set({ salience: sql`greatest(0.05, ${memories.salience} * 0.98)` })
      .where(and(eq(memories.tenantId, tenantId), eq(memories.status, 'active')));

    return { inserted, merged, reviews };
  }

  private async resolveRef(tenantId: string, ref: EntityRef): Promise<string | null> {
    if (ref.id) return ref.id;
    if (ref.newEntity) return this.deps.graph.resolveOrCreateEntity(tenantId, ref.newEntity.kind, ref.newEntity.name);
    return null;
  }
}
