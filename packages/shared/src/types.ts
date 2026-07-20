/**
 * Inferred types only (CLAUDE.md: "types.ts — inferred exports only").
 * Literal-union types derived from the `as const` vocabularies in constants.ts.
 * Zod-derived API/domain types are added under ./schemas and re-exported from index.ts.
 */
import type {
  ENTITY_KINDS,
  JOB_TYPES,
  QUEUE_NAMES,
  RELATION_TYPES,
  STAGES,
} from './constants';

export type QueueName = (typeof QUEUE_NAMES)[number];
export type PipelineStage = (typeof STAGES)[number];
export type EntityKind = (typeof ENTITY_KINDS)[number];
export type RelationType = (typeof RELATION_TYPES)[number];
export type JobType = (typeof JOB_TYPES)[number];
