/**
 * Plaud personal-data API contracts (docs/05 §3, Appendix A). Plaud is the system of record for
 * meeting capture; Recall consumes transcripts + notes and builds the graph across meetings.
 *
 * These endpoints are UNDOCUMENTED (only the Embedded/partner APIs have a public OpenAPI spec),
 * so the mitigation is zod-at-the-boundary: unknown fields are ignored, missing REQUIRED fields
 * fail loudly and mark the sync run degraded rather than silently emptying it (docs/05 §3.1).
 * Field names below follow Appendix A; correct them against a real recorded fixture, and let the
 * CI contract-drift canary (docs/05 §10) catch server-side changes before meetings stop syncing.
 */
import { z } from 'zod';

/**
 * Recall-side readiness state for a Plaud recording (docs/05 §3.4). Persisted in Phase 3b;
 * defined here so the adapter and the sync loop share one vocabulary.
 *   discovered        — seen in list_files, not yet detailed.
 *   awaiting_transcript — get_file shows transcript/summary not ready; re-checked each cycle.
 *   ready             — transcript AND notes available.
 *   ingested          — downstream memory extraction done, provenance written.
 *   stalled           — not ready after PLAUD_STALL_ALERT_HOURS; emits a WA alert.
 *   superseded        — contentHash changed; a newer version was ingested.
 */
export const plaudReadinessStates = [
  'discovered',
  'awaiting_transcript',
  'ready',
  'ingested',
  'stalled',
  'superseded',
] as const;
export const plaudReadinessSchema = z.enum(plaudReadinessStates);
export type PlaudReadiness = z.infer<typeof plaudReadinessSchema>;

/** One recording as returned by list_files. `duration` is MILLISECONDS (Appendix A). */
export const plaudFileSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  created_at: z.string(),
  start_at: z.string(),
  duration: z.number().int().nonnegative(),
  serial_number: z.string().nullable().optional(),
});
export type PlaudFileSummary = z.infer<typeof plaudFileSummarySchema>;

/** list_files page. Pagination is IGNORED when name/date filters are set (Appendix A). */
export const plaudFileListSchema = z.object({
  files: z.array(plaudFileSummarySchema),
  /** Opaque forward cursor when present; we also keep a time-overlap window (docs/05 §3.5). */
  next_cursor: z.string().nullable().optional(),
});
export type PlaudFileList = z.infer<typeof plaudFileListSchema>;

/**
 * A transcript segment from `source_list`. start/end are milliseconds. `speaker` is a LABEL
 * ("Speaker 1"), not an identity — resolution to a contact happens in Phase 3c.
 */
export const plaudSegmentSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  speaker: z.string(),
  text: z.string(),
});
export type PlaudSegment = z.infer<typeof plaudSegmentSchema>;

/**
 * get_file detail. `presigned_url` is valid 24h — NOT provenance, which is why 3b mirrors the
 * transcript+notes to R2. The three availability booleans drive the readiness state machine.
 */
export const plaudFileDetailSchema = plaudFileSummarySchema.extend({
  presigned_url: z.string().url().nullable().optional(),
  has_audio: z.boolean().default(false),
  has_transcript: z.boolean().default(false),
  has_summary: z.boolean().default(false),
  source_list: z.array(plaudSegmentSchema).default([]),
  /** Notes markdown. Appendix A calls it note_list; some responses send a single string. */
  note_list: z.union([z.string(), z.array(z.string())]).default(''),
});
export type PlaudFileDetail = z.infer<typeof plaudFileDetailSchema>;

/** OAuth token-refresh response. Shapes vary; we read the access token + its lifetime only. */
export const plaudTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
});
export type PlaudTokenResponse = z.infer<typeof plaudTokenResponseSchema>;

/** Normalized notes: always a single markdown string regardless of the wire shape. */
export function plaudNotesMarkdown(detail: Pick<PlaudFileDetail, 'note_list'>): string {
  return Array.isArray(detail.note_list) ? detail.note_list.join('\n\n') : detail.note_list;
}
