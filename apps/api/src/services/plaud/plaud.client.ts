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
  plaudTranscriptSegments,
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
  /** 1-based page (the Plaud API is page-based, not cursor-based — verified from the CLI). */
  page?: number;
  pageSize?: number;
}

export interface PlaudClient {
  listFiles(opts?: ListOptions): Promise<{ files: PlaudFileSummary[]; nextCursor: string | null }>;
  getFile(plaudId: string): Promise<PlaudFileDetail>;
}

/** Extract the persisted transcript from a detail. Speaker labels are opaque ("Speaker 1");
 *  identity resolution is Phase 3c. */
export function toTranscriptSegments(detail: Pick<PlaudFileDetail, 'source_list'>): TranscriptSegment[] {
  return plaudTranscriptSegments(detail).map((s) => ({
    startMs: Math.round(s.start_time),
    endMs: Math.round(s.end_time),
    speakerKey: s.speaker,
    text: s.content.trim(),
  }));
}

export class HttpPlaudClient implements PlaudClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: PlaudTokenProvider,
  ) {}

  async listFiles(opts: ListOptions = {}): Promise<{ files: PlaudFileSummary[]; nextCursor: string | null }> {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 50;
    // Real path verified from @plaud-ai/cli: GET /open/third-party/files/?page=&page_size=
    const json = await this.get(`/open/third-party/files/?page=${page}&page_size=${pageSize}`);
    const parsed = plaudFileListSchema.safeParse(json);
    if (!parsed.success) {
      throw new PlaudSchemaError('plaud list_files: unexpected shape', parsed.error.issues);
    }
    // Page-based API: a full page implies more may exist. The caller pages until short.
    const full = parsed.data.data.length === pageSize;
    return { files: parsed.data.data, nextCursor: full ? String(page + 1) : null };
  }

  async getFile(plaudId: string): Promise<PlaudFileDetail> {
    const json = await this.get(`/open/third-party/files/${encodeURIComponent(plaudId)}`);
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
