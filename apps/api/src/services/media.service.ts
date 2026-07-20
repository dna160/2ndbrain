/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/media.service.ts
 * Role    : Fetch Meta media immediately (URLs expire), stream to R2, sha256-dedupe into
 *           mediaAssets, link the event, and enqueue transcription for audio. Wrapped in the
 *           pipeline `media_stored` stage. (docs/03 Phase 2; Phase 0 review risk #2.)
 * Exports : MediaService, MediaJobData
 */
import { createHash } from 'node:crypto';

import { QUEUES } from '@recall/shared/constants';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { events, mediaAssets } from '../db/schema';
import type { Enqueuer } from '../queues';
import type { MetaMediaClient } from './meta/media.client';
import type { PipelineService } from './pipeline.service';
import type { R2Client } from './r2.service';

export interface MediaJobData {
  tenantId: string;
  eventId: string;
  mediaId: string;
  mime?: string | null;
  runId: string;
}

export interface MediaDeps {
  db: Database;
  r2: Pick<R2Client, 'put'>;
  meta: MetaMediaClient;
  enqueuer: Pick<Enqueuer, 'enqueue'>;
  pipeline: Pick<PipelineService, 'stage'>;
  now?: () => Date;
}

export class MediaService {
  private readonly now: () => Date;

  constructor(private readonly deps: MediaDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async fetchAndStore(job: MediaJobData): Promise<{ mediaAssetId: string }> {
    return this.deps.pipeline.stage(job.runId, 'media_stored', async () => {
      const meta = await this.deps.meta.getMediaMeta(job.mediaId);
      const bytes = await this.deps.meta.download(meta.url);
      const sha256 = createHash('sha256').update(bytes).digest('hex');

      const existing = await this.deps.db
        .select({ id: mediaAssets.id })
        .from(mediaAssets)
        .where(and(eq(mediaAssets.tenantId, job.tenantId), eq(mediaAssets.sha256, sha256)))
        .limit(1);

      let mediaAssetId = existing[0]?.id;
      if (!mediaAssetId) {
        const key = `tenants/${job.tenantId}/media/${sha256}`;
        await this.deps.r2.put(key, bytes, meta.mimeType);
        const rows = await this.deps.db
          .insert(mediaAssets)
          .values({
            tenantId: job.tenantId,
            r2Key: key,
            mime: meta.mimeType,
            bytes: bytes.length,
            sha256,
          })
          .returning({ id: mediaAssets.id });
        mediaAssetId = rows[0]?.id;
        if (!mediaAssetId) throw new Error('media insert returned no id');
      }

      await this.deps.db
        .update(events)
        .set({ mediaAssetId, updatedAt: this.now() })
        .where(eq(events.id, job.eventId));

      const mime = job.mime ?? meta.mimeType;
      if (mime.startsWith('audio')) {
        await this.deps.enqueuer.enqueue(QUEUES.transcription, 'transcription.run', {
          tenantId: job.tenantId,
          eventId: job.eventId,
          mediaAssetId,
          runId: job.runId,
        });
      }

      return { mediaAssetId };
    });
  }
}
