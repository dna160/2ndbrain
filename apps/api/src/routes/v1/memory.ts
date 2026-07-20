/**
 * @CLAUDE_CONTEXT · /v1/memory + /v1/entities — search, entity card + neighborhood, review
 * queue + resolve, graph (docs/02 §5 Memory).
 */
import { entityCardSchema, resolveReviewRequestSchema } from '@recall/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { entities, memories, memoryReviews } from '../../db/schema';
import type { GraphService } from '../../services/memory/graph.service';

export interface MemoryRouteDeps {
  db: Database;
  graph: GraphService;
}

export function registerMemoryRoutes(app: FastifyInstance, deps: MemoryRouteDeps): void {
  app.get('/memory/search', async (request) => {
    const tenantId = request.auth!.tenantId;
    const q = (request.query as { q?: string }).q?.trim();
    const base = deps.db.select().from(memories).where(
      q
        ? and(eq(memories.tenantId, tenantId), sql`${memories.content} ilike ${'%' + q + '%'}`)
        : eq(memories.tenantId, tenantId),
    );
    const rows = await base.orderBy(desc(memories.salience)).limit(50);
    return {
      items: rows.map((m) => ({
        id: m.id,
        content: m.content,
        confidence: m.confidence,
        salience: m.salience,
        sensitivity: m.sensitivity,
        status: m.status,
        provenanceEventIds: m.provenanceEventIds,
      })),
    };
  });

  app.get('/entities/:id', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    const [entity] = await deps.db
      .select()
      .from(entities)
      .where(and(eq(entities.tenantId, tenantId), eq(entities.id, id)));
    if (!entity) return reply.code(404).send({ error: 'entity not found' });
    const graph = await deps.graph.neighborhood(tenantId, id);
    return {
      entity: entityCardSchema.parse({
        id: entity.id,
        kind: entity.kind,
        name: entity.name,
        aka: entity.aka,
        salience: entity.salience,
        sensitivity: entity.sensitivity,
        isCore: entity.isCore,
      }),
      graph,
    };
  });

  app.get('/memory/reviews', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await deps.db
      .select({
        id: memoryReviews.id,
        memoryId: memoryReviews.memoryId,
        reason: memoryReviews.reason,
        memoryContent: memories.content,
      })
      .from(memoryReviews)
      .innerJoin(memories, eq(memories.id, memoryReviews.memoryId))
      .where(and(eq(memoryReviews.tenantId, tenantId), isNull(memoryReviews.resolvedAt)))
      .orderBy(desc(memoryReviews.createdAt));
    return { items: rows };
  });

  app.post('/memory/reviews/:id/resolve', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    const parsed = resolveReviewRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });

    const [review] = await deps.db
      .update(memoryReviews)
      .set({ resolution: parsed.data.resolution, resolvedAt: new Date() })
      .where(and(eq(memoryReviews.tenantId, tenantId), eq(memoryReviews.id, id)))
      .returning({ memoryId: memoryReviews.memoryId });
    if (!review) return reply.code(404).send({ error: 'review not found' });

    // Apply the decision to the memory (approve→active, edit→active+content, reject→archived).
    if (parsed.data.resolution === 'rejected') {
      await deps.db.update(memories).set({ status: 'archived', updatedAt: new Date() }).where(eq(memories.id, review.memoryId));
    } else {
      await deps.db
        .update(memories)
        .set({
          status: 'active',
          ...(parsed.data.content ? { content: parsed.data.content } : {}),
          updatedAt: new Date(),
        })
        .where(eq(memories.id, review.memoryId));
    }
    return reply.code(200).send({ resolved: true });
  });

  app.get('/memory/graph', async (request) => {
    const tenantId = request.auth!.tenantId;
    const nodes = await deps.db
      .select({ id: entities.id, name: entities.name, kind: entities.kind, salience: entities.salience })
      .from(entities)
      .where(eq(entities.tenantId, tenantId))
      .orderBy(desc(entities.salience))
      .limit(40);
    if (nodes.length === 0) return { nodes: [], edges: [] };
    const graph = await deps.graph.neighborhood(tenantId, nodes[0]!.id);
    return graph;
  });
}
