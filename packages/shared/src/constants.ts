/**
 * Recall shared constants — the controlled vocabularies referenced across api + web.
 * Authoritative source: docs/01-ARCHITECTURE.md §4–§6, docs/04-PROMPTS.md.
 *
 * Everything here is `as const` so the inferred literal-union types in `types.ts`
 * stay in lockstep with the runtime values. Do not widen to `string[]`.
 */

// ── Queues (BullMQ) — docs/01 §5 ──────────────────────────────────────────────
// Values are namespaced `recall-*` (Lynkbot convention) so they never collide on a
// shared Redis. Keys stay the bare job kind; QueueName is the value union.
export const QUEUES = {
  media: 'recall-media',
  transcription: 'recall-transcription',
  structuring: 'recall-structuring',
  consolidation: 'recall-consolidation',
  digest: 'recall-digest',
  briefs: 'recall-briefs',
  calendarSync: 'recall-calendar-sync',
} as const;

export const QUEUE_NAMES = Object.values(QUEUES);

// ── Pipeline stages — docs/01 §4 (pipelineRuns.stages vocabulary) ─────────────
export const STAGES = [
  'ingested',
  'media_stored',
  'transcribed',
  'structured',
  'persisted',
  'notified',
] as const;

// ── Graph vocabulary — docs/01 §4 (entities / entityLinks) ────────────────────
export const ENTITY_KINDS = ['person', 'org', 'venture', 'project', 'topic'] as const;

export const RELATION_TYPES = [
  'works_at',
  'founder_of',
  'partner_in',
  'invested_in',
  'advises',
  'client_of',
  'supplier_of',
  'member_of',
  'blocks',
  'related_to',
] as const;

// ── LLM job types + model routing — docs/01 §6, docs/04 ───────────────────────
export const JOB_TYPES = [
  'structuring',
  'attribution',
  'consolidation',
  'digest',
  'brief',
  'recommendation',
] as const;

/**
 * Prompt versions — pinned per job and stored on the produced row so golden tests
 * can assert against a known prompt (docs/04 shared guardrails). Bump on any prompt edit.
 */
export const PROMPT_VERSION = {
  structuring: 'structuring@1',
  attribution: 'attribution@1',
  consolidation: 'consolidation@1',
  digest: 'digest@1',
  brief: 'brief@1',
  recommendation: 'recommendation@1',
} as const;

// ── Cost metering (IDR) — docs/01 §4 pipelineRuns.costIdr, CLAUDE.md money rule ─
/**
 * Per-unit rates used to compute `costIdr` (stored as an integer IDR — no float currency).
 * Values are placeholders wired for Phase 1's pipeline.service.meterCost(); tune against
 * real provider invoices. Cost = round(sttSeconds * sttPerSecond + tokens * tokenRate).
 */
export const RATES_IDR = {
  /** Groq Whisper v3 STT, per audio-second. */
  sttPerSecond: 0.5,
  /** deepseek-reasoner, per input token. */
  reasonerInputPerToken: 0.01,
  /** deepseek-reasoner, per output token. */
  reasonerOutputPerToken: 0.03,
  /** deepseek-chat, per input token. */
  chatInputPerToken: 0.003,
  /** deepseek-chat, per output token. */
  chatOutputPerToken: 0.006,
  /** text-embedding-3-small, per token. */
  embeddingPerToken: 0.0003,
} as const;

// ── Time — CLAUDE.md: store UTC, render WIB ───────────────────────────────────
export const DISPLAY_TZ = 'Asia/Jakarta';

// ── Meta / WhatsApp constraints — docs/00 F5, F8 ──────────────────────────────
/** Meta customer-service (free-form reply) window. */
export const WA_WINDOW_HOURS = 24;
/** Rendered digest hard cap before truncation link (docs/04 §5 renderer). */
export const DIGEST_MAX_CHARS = 1600;
/** Pre-meeting brief hard cap (docs/04 §4). */
export const BRIEF_MAX_CHARS = 900;
