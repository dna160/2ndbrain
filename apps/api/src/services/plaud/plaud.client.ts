/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/plaud/plaud.client.ts
 * Role    : Typed Plaud personal-data client (docs/05 §3.1). Primary transport is direct HTTP
 *           against the base the CLI itself uses; a CLI-subprocess fallback is a later adapter
 *           behind this same interface. Every response is validated through a zod schema in
 *           @recall/shared — unknown fields ignored, missing required fields throw
 *           PlaudSchemaError (marks the run degraded, never silently empty).
 * Exports : PlaudClient, PlaudSchemaError, HttpPlaudClient, toTranscriptSegments
 */
import {
  type PlaudFileDetail,
  type PlaudFileSummary,
  plaudFileDetailSchema,
  plaudFileListSchema,
  type PlaudSegment,
} from '@recall/shared';

import type { TranscriptSegment } from '../../db/schema/meetings';
import type { PlaudTokenProvider } from './plaud.auth';

/** Thrown when a Plaud response fails its zod schema — the undocumented-endpoint drift signal. */
export class PlaudSchemaError extends Error {
  constructor(
    message: string,
    readonly issues: unknown,
  ) {
    super(message);
    this.name = 'PlaudSchemaError';
  }
}

export interface ListOptions {
  /** Opaque forward cursor from a prior page. */
  cursor?: string;
  pageSize?: number;
  /** ISO lower bound; the sync loop applies a 6h overlap window on top (docs/05 §3.5). */
  createdFrom?: string;
}

export interface PlaudClient {
  listFiles(opts?: ListOptions): Promise<{ files: PlaudFileSummary[]; nextCursor: string | null }>;
  getFile(plaudId: string): Promise<PlaudFileDetail>;
}

/** Plaud speaker labels are opaque ("Speaker 1"); identity resolution is Phase 3c. */
export function toTranscriptSegments(segments: PlaudSegment[]): TranscriptSegment[] {
  return segments.map((s) => ({
    startMs: Math.round(s.start),
    endMs: Math.round(s.end),
    speakerKey: s.speaker,
    text: s.text.trim(),
  }));
}

export class HttpPlaudClient implements PlaudClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: PlaudTokenProvider,
  ) {}

  async listFiles(opts: ListOptions = {}): Promise<{ files: PlaudFileSummary[]; nextCursor: string | null }> {
    const params = new URLSearchParams();
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.pageSize) params.set('page_size', String(opts.pageSize));
    if (opts.createdFrom) params.set('date_from', opts.createdFrom);
    const query = params.toString();
    const json = await this.get(`/files${query ? `?${query}` : ''}`);
    const parsed = plaudFileListSchema.safeParse(json);
    if (!parsed.success) {
      throw new PlaudSchemaError('plaud list_files: unexpected shape', parsed.error.issues);
    }
    return { files: parsed.data.files, nextCursor: parsed.data.next_cursor ?? null };
  }

  async getFile(plaudId: string): Promise<PlaudFileDetail> {
    const json = await this.get(`/files/${encodeURIComponent(plaudId)}`);
    const parsed = plaudFileDetailSchema.safeParse(json);
    if (!parsed.success) {
      throw new PlaudSchemaError(`plaud get_file ${plaudId}: unexpected shape`, parsed.error.issues);
    }
    return parsed.data;
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${await this.token()}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`plaud GET ${path} failed: ${res.status}`);
    return res.json();
  }
}
