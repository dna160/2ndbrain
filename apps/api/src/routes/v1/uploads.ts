/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/routes/v1/uploads.ts
 * Role    : Dashboard audio upload path (docs/03 Phase 2 task 5).
 *           POST /v1/uploads/presign  → presigned R2 PUT (15 min).
 *           POST /v1/uploads/complete → register mediaAsset + event, enqueue transcription.
 * Exports : registerUploadRoutes()
 */
import { randomUUID } from 'node:crypto';

import {
  presignRequestSchema,
  presignResponseSchema,
  QUEUES,
  uploadCompleteRequestSchema,
  uploadCompleteResponseSchema,
} from '@recall/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';

import type { Database } from '../../db/client';
import { events, mediaAssets } from '../../db/schema';
import type { Enqueuer } from '../../queues';
import type { PipelineService } from '../../services/pipeline.service';
import type { R2Client } from '../../services/r2.service';

const PRESIGN_TTL_SEC = 15 * 60;

export interface UploadRouteDeps {
  db: Database;
  r2: Pick<R2Client, 'presignPut'>;
  enqueuer: Pick<Enqueuer, 'enqueue'>;
  pipeline: Pick<PipelineService, 'startRun' | 'stage'>;
}

function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error('invalid request body'), { statusCode: 400 });
  }
  return result.data;
}

export function registerUploadRoutes(app: FastifyInstance, deps: UploadRouteDeps): void {
  app.post('/uploads/presign', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { mime } = parse(presignRequestSchema, request.body);
    const key = `tenants/${tenantId}/uploads/${randomUUID()}`;
    const uploadUrl = await deps.r2.presignPut(key, mime, PRESIGN_TTL_SEC);
    return reply.code(200).send(
      presignResponseSchema.parse({ uploadUrl, key, expiresInSec: PRESIGN_TTL_SEC }),
    );
  });

  app.post('/uploads/complete', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const body = parse(uploadCompleteRequestSchema, request.body);

    const [asset] = await deps.db
      .insert(mediaAssets)
      .values({
        tenantId,
        r2Key: body.key,
        mime: body.mime,
        bytes: body.bytes,
        durationSec: body.durationSec ?? null,
        sha256: body.sha256,
      })
      .returning({ id: mediaAssets.id });

    const [event] = await deps.db
      .insert(events)
      .values({
        tenantId,
        source: 'upload',
        type: 'audio',
        direction: 'inbound',
        occurredAt: new Date(),
        raw: { upload: true, key: body.key },
        mediaAssetId: asset!.id,
      })
      .returning({ id: events.id });

    // Already in R2 — mark ingested + media_stored, then hand off to transcription.
    const runId = await deps.pipeline.startRun({
      tenantId,
      jobType: 'upload',
      refType: 'event',
      refId: event!.id,
    });
    await deps.pipeline.stage(runId, 'ingested', async () => undefined);
    await deps.pipeline.stage(runId, 'media_stored', async () => undefined);
    await deps.enqueuer.enqueue(QUEUES.transcription, 'transcription.run', {
      tenantId,
      eventId: event!.id,
      mediaAssetId: asset!.id,
      runId,
    });

    return reply.code(201).send(
      uploadCompleteResponseSchema.parse({ eventId: event!.id, mediaAssetId: asset!.id }),
    );
  });
}
