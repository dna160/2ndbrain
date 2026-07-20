/**
 * Pipeline ledger service (docs/01 §4, docs/03 Phase 1).
 * Every slow job wraps its stages with `stage(runId, name, fn)` so `pipeline_runs` records
 * ordered stage transitions + latency, and meters STT seconds / tokens → integer IDR cost.
 * A job that doesn't log its stages is a bug (CLAUDE.md).
 */
import type { PipelineStage } from '@recall/shared';
import { RATES_IDR } from '@recall/shared/constants';
import { eq, sql } from 'drizzle-orm';

import type { Database } from '../db/client';
import { pipelineRuns, type PipelineStageEntry } from '../db/schema';

export type CostModel = 'reasoner' | 'chat' | 'embedding';

export interface MeterInput {
  sttSeconds?: number;
  tokensIn?: number;
  tokensOut?: number;
  model?: CostModel;
}

/**
 * Pure cost computation → integer IDR (no float currency; CLAUDE.md money rule).
 * STT is always billed; token rates depend on the model tier.
 */
export function computeCostIdr(input: MeterInput): number {
  const { sttSeconds = 0, tokensIn = 0, tokensOut = 0, model } = input;
  let idr = sttSeconds * RATES_IDR.sttPerSecond;
  if (model === 'reasoner') {
    idr += tokensIn * RATES_IDR.reasonerInputPerToken + tokensOut * RATES_IDR.reasonerOutputPerToken;
  } else if (model === 'chat') {
    idr += tokensIn * RATES_IDR.chatInputPerToken + tokensOut * RATES_IDR.chatOutputPerToken;
  } else if (model === 'embedding') {
    idr += tokensIn * RATES_IDR.embeddingPerToken;
  }
  return Math.round(idr);
}

export interface StartRunInput {
  tenantId: string;
  jobType: string;
  refType?: string;
  refId?: string;
}

export class PipelineService {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Open a run in `running` state; returns its id. */
  async startRun(input: StartRunInput): Promise<string> {
    const rows = await this.db
      .insert(pipelineRuns)
      .values({
        tenantId: input.tenantId,
        jobType: input.jobType,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        status: 'running',
        attempts: 1,
      })
      .returning({ id: pipelineRuns.id });
    const id = rows[0]?.id;
    if (!id) throw new Error('startRun: insert returned no id');
    return id;
  }

  /**
   * Time `fn`, append the stage entry (atomic jsonb concat), and on error mark the run
   * `failed` with the error payload before rethrowing so the worker/DLQ path sees it.
   */
  async stage<T>(runId: string, name: PipelineStage, fn: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    try {
      const result = await fn();
      await this.appendStage(runId, {
        stage: name,
        at: startedAt.toISOString(),
        ms: this.now().getTime() - startedAt.getTime(),
        ok: true,
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.appendStage(runId, {
        stage: name,
        at: startedAt.toISOString(),
        ms: this.now().getTime() - startedAt.getTime(),
        ok: false,
        err: message,
      });
      await this.db
        .update(pipelineRuns)
        .set({ status: 'failed', error: { stage: name, message }, updatedAt: this.now() })
        .where(eq(pipelineRuns.id, runId));
      throw err;
    }
  }

  private async appendStage(runId: string, entry: PipelineStageEntry): Promise<void> {
    await this.db
      .update(pipelineRuns)
      .set({
        stages: sql`${pipelineRuns.stages} || ${JSON.stringify([entry])}::jsonb`,
        updatedAt: this.now(),
      })
      .where(eq(pipelineRuns.id, runId));
  }

  /** Add cost + usage to the run atomically; returns the new cumulative IDR cost. */
  async meterCost(runId: string, input: MeterInput): Promise<number> {
    const addIdr = computeCostIdr(input);
    const rows = await this.db
      .update(pipelineRuns)
      .set({
        sttSeconds: sql`${pipelineRuns.sttSeconds} + ${input.sttSeconds ?? 0}`,
        tokensIn: sql`${pipelineRuns.tokensIn} + ${input.tokensIn ?? 0}`,
        tokensOut: sql`${pipelineRuns.tokensOut} + ${input.tokensOut ?? 0}`,
        costIdr: sql`${pipelineRuns.costIdr} + ${addIdr}`,
        updatedAt: this.now(),
      })
      .where(eq(pipelineRuns.id, runId))
      .returning({ costIdr: pipelineRuns.costIdr });
    const total = rows[0]?.costIdr;
    if (total === undefined) throw new Error(`meterCost: run ${runId} not found`);
    return total;
  }

  /** Close a run terminally. */
  async completeRun(runId: string, status: 'done' | 'dead' = 'done'): Promise<void> {
    await this.db
      .update(pipelineRuns)
      .set({ status, updatedAt: this.now() })
      .where(eq(pipelineRuns.id, runId));
  }
}
