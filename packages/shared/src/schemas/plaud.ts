/**
 * Plaud personal-data API contracts (docs/05 §3). Plaud is the system of record for meeting
 * capture; Recall consumes transcripts + notes and builds the graph across meetings.
 *
 * VERIFIED against a live response (2026-08-08), not the PRD's Appendix-A guesses:
 *   list  GET /open/third-party/files/?page=&page_size=  → { type, data: FileSummary[], page, page_size }
 *   file  GET /open/third-party/files/{id}               → FileSummary + presigned_url + source_list[] + note_list[]
 * There are NO has_transcript/has_summary booleans. Readiness is derived from block content:
 *   - source_list holds content BLOCKS; the `transaction` (or `transaction_polish`) block's
 *     `data_content` is a JSON-encoded array of {content,start_time,end_time,speaker} segments.
 *   - note_list holds note BLOCKS; the `auto_sum_note` block's `data_content` is the markdown summary.
 * page_size must be 10–100 (the API 422s below 10). zod-at-boundary: unknown fields ignored,
 * missing required fields throw (→ run marked degraded, never silently empty; docs/05 §3.1).
 */
import { z } from 'zod';

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

/** One recording as returned by list_files. `duration` is MILLISECONDS. */
export const plaudFileSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  created_at: z.string(),
  start_at: z.string(),
  duration: z.number().int().nonnegative(),
  serial_number: z.string().nullable().optional(),
});
export type PlaudFileSummary = z.infer<typeof plaudFileSummarySchema>;

/** list_files page wrapper: the recordings are under `data`; pagination is page-based. */
export const plaudFileListSchema = z.object({
  data: z.array(plaudFileSummarySchema),
  page: z.number().int().optional(),
  page_size: z.number().int().optional(),
});
export type PlaudFileList = z.infer<typeof plaudFileListSchema>;

/** A content block in source_list / note_list. `data_content` meaning depends on `data_type`. */
export const plaudBlockSchema = z.object({
  data_id: z.string().optional(),
  data_type: z.string(),
  data_title: z.string().optional(),
  data_content: z.string().default(''),
  data_link: z.string().optional(),
});
export type PlaudBlock = z.infer<typeof plaudBlockSchema>;

/** get_file detail. `presigned_url` is valid 24h — NOT provenance (3b mirrors text to R2). */
export const plaudFileDetailSchema = plaudFileSummarySchema.extend({
  presigned_url: z.string().url().nullable().optional(),
  source_list: z.array(plaudBlockSchema).default([]),
  note_list: z.array(plaudBlockSchema).default([]),
});
export type PlaudFileDetail = z.infer<typeof plaudFileDetailSchema>;

/** One segment inside a transaction block's JSON-encoded `data_content`. Times are ms. */
export const plaudSegmentSchema = z.object({
  content: z.string(),
  start_time: z.number().nonnegative(),
  end_time: z.number().nonnegative(),
  speaker: z.string().default('Speaker 1'),
});
export type PlaudSegment = z.infer<typeof plaudSegmentSchema>;

/** OAuth token-refresh response (verified). `refresh_token` ROTATES (see plaud.auth.ts). */
export const plaudTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().optional(),
  refresh_token: z.string().optional(),
});
export type PlaudTokenResponse = z.infer<typeof plaudTokenResponseSchema>;

const TRANSCRIPT_TYPES = ['transaction_polish', 'transaction'] as const;

/** Parse the transcript segments out of the best available transaction block (polished first). */
export function plaudTranscriptSegments(detail: Pick<PlaudFileDetail, 'source_list'>): PlaudSegment[] {
  for (const type of TRANSCRIPT_TYPES) {
    const block = detail.source_list.find((b) => b.data_type === type);
    if (!block?.data_content) continue;
    try {
      const parsed = z.array(plaudSegmentSchema).safeParse(JSON.parse(block.data_content));
      if (parsed.success && parsed.data.length > 0) return parsed.data;
    } catch {
      // Block content is not the JSON array we expect; try the next block type.
    }
  }
  return [];
}

/** Notes markdown = the auto_sum_note block (or the first note block with content). */
export function plaudNotesMarkdown(detail: Pick<PlaudFileDetail, 'note_list'>): string {
  const summary = detail.note_list.find((b) => b.data_type === 'auto_sum_note' && b.data_content);
  return (summary ?? detail.note_list.find((b) => b.data_content))?.data_content ?? '';
}

/** Ready = we can extract transcript segments AND a notes summary. */
export function plaudIsReady(detail: PlaudFileDetail): boolean {
  return plaudTranscriptSegments(detail).length > 0 && plaudNotesMarkdown(detail).length > 0;
}
