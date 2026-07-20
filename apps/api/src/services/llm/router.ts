/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/llm/router.ts
 * Role    : jobType → model + temperature routing (docs/01 §6, docs/04 temperatures).
 *           Cost model per job for pipeline.meterCost.
 * Exports : MODEL_ROUTING, TEMPERATURE, costModelFor
 */
import type { CostModel } from '../pipeline.service';

export const MODEL_ROUTING = {
  structuring: 'deepseek-reasoner',
  consolidation: 'deepseek-reasoner',
  digest: 'deepseek-reasoner',
  brief: 'deepseek-reasoner',
  recommendation: 'deepseek-reasoner',
  attribution: 'deepseek-chat',
} as const;

export const TEMPERATURE = {
  structuring: 0.3,
  consolidation: 0.2,
  digest: 0.4,
  brief: 0.4,
  attribution: 0.2,
} as const;

/** Map a DeepSeek model id to its pipeline cost tier. */
export function costModelFor(model: string): CostModel {
  return model === 'deepseek-chat' ? 'chat' : 'reasoner';
}
