/**
 * Zod schema barrel — the single source of truth for API contracts (CLAUDE.md).
 * Every request/response and persisted-domain shape lands here as a zod schema;
 * apps/api validates with it, apps/web imports the inferred type.
 *
 * Phase 0: intentionally empty beyond the vocabulary schemas below. Domain schemas
 * (events, meetings, memories, digests, pipeline, api/*) are added in their phases —
 * see docs/03-BUILD-PHASES.md. Adding a schema here is the FIRST step of any contract change.
 */
import { z } from 'zod';

import {
  ENTITY_KINDS,
  JOB_TYPES,
  RELATION_TYPES,
  STAGES,
} from '../constants';

export const entityKindSchema = z.enum(ENTITY_KINDS);
export const relationTypeSchema = z.enum(RELATION_TYPES);
export const pipelineStageSchema = z.enum(STAGES);
export const jobTypeSchema = z.enum(JOB_TYPES);

// ── Ingestion contracts ───────────────────────────────────────────────────────
export * from './meta';

// ── Meeting Note contracts ────────────────────────────────────────────────────
export * from './meeting';

// ── Calendar + Conversations contracts ────────────────────────────────────────
export * from './calendar';
export * from './conversations';

// ── Memory contracts ──────────────────────────────────────────────────────────
export * from './memory';

// ── API contracts (per phase) ─────────────────────────────────────────────────
export * from './api/settings';
export * from './api/uploads';
export * from './api/lists';
