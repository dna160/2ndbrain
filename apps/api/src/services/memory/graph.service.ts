/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/memory/graph.service.ts
 * Role    : Entity CRUD + aka-resolution + typed link upsert (strength EMA, provenance union)
 *           + neighborhood walk via recursive CTE (depth ≤2, salience-ordered, cap 40).
 * Exports : GraphService
 */
import type { EntityKind, Graph, RelationType } from '@recall/shared';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { entities, entityLinks } from '../../db/schema';
import { emaMerge } from './math';

export class GraphService {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** aka-resolution: reuse an entity whose name matches (case-insensitive), else create. */
  async resolveOrCreateEntity(tenantId: string, kind: EntityKind, name: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: entities.id })
      .from(entities)
      .where(and(eq(entities.tenantId, tenantId), sql`lower(${entities.name}) = lower(${name})`))
      .limit(1);
    if (existing) return existing.id;
    const rows = await this.db.insert(entities).values({ tenantId, kind, name }).returning({ id: entities.id });
    const id = rows[0]?.id;
    if (!id) throw new Error('resolveOrCreateEntity: insert returned no id');
    return id;
  }

  async upsertLink(
    tenantId: string,
    fromId: string,
    toId: string,
    relation: RelationType,
    strengthDelta: number,
    provenanceEventIds: string[],
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(entityLinks)
      .where(
        and(
          eq(entityLinks.tenantId, tenantId),
          eq(entityLinks.fromId, fromId),
          eq(entityLinks.toId, toId),
          eq(entityLinks.relation, relation),
        ),
      );
    if (existing) {
      const strength = emaMerge(existing.strength, Math.min(1, existing.strength + strengthDelta));
      const provenance = [...new Set([...existing.provenanceEventIds, ...provenanceEventIds])];
      await this.db
        .update(entityLinks)
        .set({ strength, provenanceEventIds: provenance, updatedAt: this.now() })
        .where(eq(entityLinks.id, existing.id));
    } else {
      await this.db.insert(entityLinks).values({
        tenantId,
        fromId,
        toId,
        relation,
        strength: Math.min(1, 0.5 + strengthDelta),
        provenanceEventIds,
      });
    }
  }

  /** Recursive-CTE neighborhood (integration-tested against real Postgres). */
  async neighborhood(tenantId: string, entityId: string, depth = 2, cap = 40): Promise<Graph> {
    const nodeRows = (await this.db.execute(sql`
      WITH RECURSIVE walk(id, d) AS (
        SELECT ${entityId}::uuid, 0
        UNION
        SELECT CASE WHEN el.from_id = w.id THEN el.to_id ELSE el.from_id END, w.d + 1
        FROM walk w
        JOIN entity_links el ON (el.from_id = w.id OR el.to_id = w.id) AND el.tenant_id = ${tenantId}::uuid
        WHERE w.d < ${depth}
      )
      SELECT DISTINCT e.id, e.name, e.kind, e.salience
      FROM walk w JOIN entities e ON e.id = w.id
      ORDER BY e.salience DESC
      LIMIT ${cap}
    `)) as unknown as Array<{ id: string; name: string; kind: EntityKind; salience: number }>;

    const ids = nodeRows.map((n) => n.id);
    const edges =
      ids.length === 0
        ? []
        : ((await this.db.execute(sql`
            SELECT from_id AS "fromId", to_id AS "toId", relation, strength
            FROM entity_links
            WHERE tenant_id = ${tenantId}::uuid
              AND from_id = ANY(${ids}::uuid[]) AND to_id = ANY(${ids}::uuid[])
          `)) as unknown as Array<{ fromId: string; toId: string; relation: RelationType; strength: number }>);

    return { nodes: nodeRows, edges };
  }
}
