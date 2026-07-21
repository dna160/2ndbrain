/**
 * @CLAUDE_CONTEXT
 * Package : apps/api
 * File    : src/services/ingest.service.ts
 * Role    : Normalize an inbound Meta webhook payload into `events` (idempotent on externalId),
 *           apply the blacklist gate (blocked sender → drop, persist nothing), and enqueue
 *           the `media` job / mark `persisted`. Adapted from Lynkbot routes/webhooks/meta.ts.
 * Exports : IngestService
 */
import type { IngestResponse } from '@recall/shared';
import { QUEUES } from '@recall/shared/constants';
import { and, eq } from 'drizzle-orm';

import type { Database } from '../db/client';
import { events, waContacts } from '../db/schema';
import type { Enqueuer } from '../queues';
import { extractInboundMessages, type ExtractedInbound } from './meta/extract';
import type { PipelineService } from './pipeline.service';

export interface IngestDeps {
  db: Database;
  enqueuer: Pick<Enqueuer, 'enqueue'>;
  pipeline: Pick<PipelineService, 'startRun' | 'stage' | 'completeRun'>;
  /** Drop counter (metrics only) — the sole trace a blacklisted message leaves. */
  recordDrop?: (waId: string) => void;
  now?: () => Date;
}

export class IngestService {
  private readonly now: () => Date;

  constructor(private readonly deps: IngestDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async ingestPayload(tenantId: string, body: unknown): Promise<IngestResponse> {
    const messages = extractInboundMessages(body);
    let persisted = 0;
    let duplicates = 0;
    let dropped = 0;

    for (const message of messages) {
      if (await this.isBlocked(tenantId, message.senderWaId)) {
        dropped++;
        this.deps.recordDrop?.(message.senderWaId);
        continue; // blacklist: persist nothing (CLAUDE.md)
      }
      await this.touchContact(tenantId, message.senderWaId, message.senderName);

      const eventId = await this.insertEvent(tenantId, message);
      if (!eventId) {
        duplicates++; // idempotent: externalId already present
        continue;
      }
      persisted++;
      await this.startPipeline(tenantId, eventId, message);
    }

    return { received: true, persisted, duplicates, dropped };
  }

  /** Ensure the contact exists (first sight), then read its blocked flag. */
  private async isBlocked(tenantId: string, waId: string): Promise<boolean> {
    await this.deps.db
      .insert(waContacts)
      .values({ tenantId, waId })
      .onConflictDoNothing({ target: waContacts.waId });
    const rows = await this.deps.db
      .select({ blocked: waContacts.blocked })
      .from(waContacts)
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)))
      .limit(1);
    return rows[0]?.blocked ?? false;
  }

  /**
   * Refresh last-seen and the WhatsApp profile name. `profileName` is overwritten every time
   * because the sender can rename themselves; the operator's own `label` is never touched.
   */
  private async touchContact(tenantId: string, waId: string, senderName: string | null): Promise<void> {
    await this.deps.db
      .update(waContacts)
      .set({
        lastInboundAt: this.now(),
        updatedAt: this.now(),
        ...(senderName ? { profileName: senderName } : {}),
      })
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)));
  }

  /** Idempotent insert on externalId — returns the new id, or null on duplicate. */
  private async insertEvent(tenantId: string, m: ExtractedInbound): Promise<string | null> {
    const rows = await this.deps.db
      .insert(events)
      .values({
        tenantId,
        source: 'wa',
        type: m.eventType,
        direction: 'inbound',
        externalId: m.metaMessageId,
        senderWaId: m.senderWaId,
        occurredAt: new Date(m.occurredAt),
        content: m.content,
        raw: m.raw,
      })
      .onConflictDoNothing({ target: events.externalId })
      .returning({ id: events.id });
    return rows[0]?.id ?? null;
  }

  private async startPipeline(
    tenantId: string,
    eventId: string,
    m: ExtractedInbound,
  ): Promise<void> {
    const runId = await this.deps.pipeline.startRun({
      tenantId,
      jobType: 'ingest',
      refType: 'event',
      refId: eventId,
    });
    await this.deps.pipeline.stage(runId, 'ingested', async () => undefined);

    if (m.mediaId) {
      // Meta media URLs are short-lived — the media worker fetches immediately.
      await this.deps.enqueuer.enqueue(QUEUES.media, 'media.fetch', {
        tenantId,
        eventId,
        mediaId: m.mediaId,
        mime: m.mime,
        runId,
      });
    } else {
      await this.deps.pipeline.stage(runId, 'persisted', async () => undefined);
      await this.deps.pipeline.completeRun(runId);
    }
  }
}
