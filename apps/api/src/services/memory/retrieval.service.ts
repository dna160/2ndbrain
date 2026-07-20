/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/memory/retrieval.service.ts
 * Role    : contextFor — T3 core + hybrid top-k (vector/salience, recency-weighted) + sensitivity
 *           filter. One retrieval service used by structuring recommendations + briefs (docs/00 F4).
 *           `rankMemories` is pure + deterministic (QC gate).
 * Exports : RetrievalService, rankMemories
 */
import { and, asc, desc, eq } from 'drizzle-orm';

import type { Database } from '../../db/client';
import { coreMemories, memories } from '../../db/schema';
import type { EmbeddingsProvider } from './embeddings';
import { cosineSimilarity } from './math';

export interface Rankable {
  id: string;
  score: number;
  createdAt: Date;
}

/** Deterministic: 0.7*score + 0.3*recency, ties broken by id. */
export function rankMemories<T extends Rankable>(items: T[], now: Date): T[] {
  return items
    .map((it) => {
      const ageDays = (now.getTime() - it.createdAt.getTime()) / 86_400_000;
      const recency = Math.exp(-ageDays / 30);
      return { it, combined: 0.7 * it.score + 0.3 * recency };
    })
    .sort((a, b) => b.combined - a.combined || a.it.id.localeCompare(b.it.id))
    .map((s) => s.it);
}

export interface ContextOptions {
  query?: string;
  includeSensitive?: boolean;
  limit?: number;
}

export interface RetrievalDeps {
  db: Database;
  embeddings: EmbeddingsProvider;
  now?: () => Date;
}

export class RetrievalService {
  private readonly now: () => Date;

  constructor(private readonly deps: RetrievalDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async contextFor(tenantId: string, opts: ContextOptions = {}): Promise<string> {
    const core = await this.deps.db
      .select({ content: coreMemories.content })
      .from(coreMemories)
      .where(eq(coreMemories.tenantId, tenantId))
      .orderBy(asc(coreMemories.position));

    let candidates = await this.deps.db
      .select({
        id: memories.id,
        content: memories.content,
        salience: memories.salience,
        sensitivity: memories.sensitivity,
        embedding: memories.embedding,
        createdAt: memories.createdAt,
      })
      .from(memories)
      .where(and(eq(memories.tenantId, tenantId), eq(memories.status, 'active')))
      .orderBy(desc(memories.salience))
      .limit(200);

    // Briefs/digests exclude sensitive unless entity-scoped (docs/00 F4).
    if (!opts.includeSensitive) candidates = candidates.filter((c) => c.sensitivity !== 'sensitive');

    let queryVector: number[] | undefined;
    if (opts.query) [queryVector] = await this.deps.embeddings.embed([opts.query]);

    const scored = candidates.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      score: queryVector && c.embedding ? cosineSimilarity(queryVector, c.embedding) : c.salience,
    }));

    const ranked = rankMemories(scored, this.now()).slice(0, opts.limit ?? 12);
    return [...core.map((c) => c.content), ...ranked.map((r) => r.content)].join('\n');
  }
}
