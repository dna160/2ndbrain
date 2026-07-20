/**
 * @CLAUDE_CONTEXT
 * Package : apps/api · File: src/services/conversations.service.ts
 * Role    : Full-inbox conversations (docs/00 F8) — thread aggregation, window-aware reply
 *           (takeover BEFORE send on bot-active threads), read receipts, and blacklist purge
 *           (the ONLY hard-delete path in the codebase — CLAUDE.md).
 * Exports : ConversationsService
 */
import type { ConversationFilter, Thread } from '@recall/shared';
import { WA_WINDOW_HOURS } from '@recall/shared/constants';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import type { Database } from '../db/client';
import { events, mediaAssets, waContacts } from '../db/schema';
import type { TakeoverClient } from './lynkbot.client';
import type { WaSendService } from './waSend.service';

export interface ReplyResult {
  needsConfirm?: boolean;
  eventId?: string;
  delivery?: 'sent' | 'template';
  windowOpen?: boolean;
}

export interface ConversationsDeps {
  db: Database;
  waSend: Pick<WaSendService, 'send'>;
  takeover: TakeoverClient;
  now?: () => Date;
}

export class ConversationsService {
  private readonly now: () => Date;

  constructor(private readonly deps: ConversationsDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async listThreads(tenantId: string, filter: ConversationFilter): Promise<Thread[]> {
    const now = this.now();
    const agg = await this.deps.db
      .select({
        waId: events.senderWaId,
        lastAt: sql<string>`max(${events.occurredAt})`.as('last_at'),
        unread: sql<number>`count(*) filter (where ${events.readAt} is null and ${events.direction} = 'inbound')`.as('unread'),
      })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.source, 'wa'), isNotNull(events.senderWaId)))
      .groupBy(events.senderWaId);

    const contacts = await this.deps.db
      .select()
      .from(waContacts)
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.blocked, false)));
    const byWaId = new Map(contacts.map((c) => [c.waId, c]));

    const threads: Thread[] = [];
    for (const row of agg) {
      if (!row.waId) continue;
      const contact = byWaId.get(row.waId);
      if (!contact) continue; // blocked / unknown → excluded
      const botActive = (contact.botActiveUntil?.getTime() ?? 0) > now.getTime();
      if (filter === 'bot' && !botActive) continue;
      if (filter === 'personal' && !contact.label) continue;
      const [last] = await this.deps.db
        .select({ content: events.content })
        .from(events)
        .where(and(eq(events.tenantId, tenantId), eq(events.senderWaId, row.waId)))
        .orderBy(desc(events.occurredAt))
        .limit(1);
      threads.push({
        waId: row.waId,
        label: contact.label,
        lastMessage: last?.content ?? null,
        lastAt: row.lastAt ? new Date(row.lastAt).toISOString() : null,
        unreadCount: Number(row.unread),
        botActive,
      });
    }
    return threads.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  }

  async messages(tenantId: string, waId: string, limit = 50) {
    return this.deps.db
      .select()
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.senderWaId, waId)))
      .orderBy(desc(events.occurredAt))
      .limit(limit);
  }

  private async isBotActive(tenantId: string, waId: string): Promise<boolean> {
    const [c] = await this.deps.db
      .select({ botActiveUntil: waContacts.botActiveUntil })
      .from(waContacts)
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)));
    return (c?.botActiveUntil?.getTime() ?? 0) > this.now().getTime();
  }

  async reply(
    tenantId: string,
    waId: string,
    text: string,
    confirmTakeover = false,
  ): Promise<ReplyResult> {
    if ((await this.isBotActive(tenantId, waId)) && !confirmTakeover) {
      return { needsConfirm: true };
    }
    if (confirmTakeover) {
      // Pause the bot FIRST, then send (docs/00 F8 takeover protocol).
      const until = new Date(this.now().getTime() + WA_WINDOW_HOURS * 3600 * 1000);
      await this.takeover(tenantId, waId, until);
    }

    const send = await this.deps.waSend.send(waId, text);
    const rows = await this.deps.db
      .insert(events)
      .values({
        tenantId,
        source: 'wa',
        type: 'message',
        direction: 'outbound',
        externalId: send.messageId,
        senderWaId: waId,
        occurredAt: this.now(),
        content: text,
        raw: { delivery: send.delivery },
      })
      .returning({ id: events.id });
    return { eventId: rows[0]?.id, delivery: send.delivery, windowOpen: send.windowOpen };
  }

  async takeover(tenantId: string, waId: string, until: Date): Promise<void> {
    await this.deps.takeover.pause(waId, until.toISOString());
    await this.deps.db
      .update(waContacts)
      .set({ botActiveUntil: until, updatedAt: this.now() })
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)));
  }

  async resume(tenantId: string, waId: string): Promise<void> {
    await this.deps.takeover.resume(waId);
    await this.deps.db
      .update(waContacts)
      .set({ botActiveUntil: null, updatedAt: this.now() })
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)));
  }

  async markRead(tenantId: string, waId: string): Promise<void> {
    await this.deps.db
      .update(events)
      .set({ readAt: this.now() })
      .where(
        and(
          eq(events.tenantId, tenantId),
          eq(events.senderWaId, waId),
          eq(events.direction, 'inbound'),
          isNull(events.readAt),
        ),
      );
  }

  /** Blacklist + optional history purge — the ONLY hard-delete path (CLAUDE.md). */
  async blockAndPurge(tenantId: string, waId: string, purgeHistory: boolean): Promise<void> {
    await this.deps.db
      .update(waContacts)
      .set({ blocked: true, purgedAt: purgeHistory ? this.now() : null, updatedAt: this.now() })
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)));
    if (!purgeHistory) return;

    const rows = await this.deps.db
      .select({ mediaAssetId: events.mediaAssetId })
      .from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.senderWaId, waId)));
    await this.deps.db
      .delete(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.senderWaId, waId)));
    const assetIds = [...new Set(rows.map((r) => r.mediaAssetId).filter((x): x is string => Boolean(x)))];
    for (const id of assetIds) {
      await this.deps.db.delete(mediaAssets).where(eq(mediaAssets.id, id));
    }
  }
}
