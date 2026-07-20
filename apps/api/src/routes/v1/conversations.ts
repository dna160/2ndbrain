/**
 * @CLAUDE_CONTEXT · /v1/conversations — threads, messages, window-aware reply, takeover,
 * read receipts, blacklist purge (docs/00 F8, docs/02 §5).
 */
import {
  blockThreadRequestSchema,
  conversationFilterSchema,
  sendReplyRequestSchema,
} from '@recall/shared';
import type { FastifyInstance } from 'fastify';

import type { ConversationsService } from '../../services/conversations.service';

export interface ConversationsRouteDeps {
  conversations: ConversationsService;
  now?: () => Date;
}

export function registerConversationRoutes(app: FastifyInstance, deps: ConversationsRouteDeps): void {
  const now = deps.now ?? (() => new Date());

  app.get('/conversations', async (request) => {
    const tenantId = request.auth!.tenantId;
    const filter = conversationFilterSchema.catch('all').parse((request.query as { filter?: string }).filter);
    return { items: await deps.conversations.listThreads(tenantId, filter) };
  });

  app.get('/conversations/:waId/messages', async (request) => {
    const tenantId = request.auth!.tenantId;
    const { waId } = request.params as { waId: string };
    const rows = await deps.conversations.messages(tenantId, waId);
    return {
      items: rows.map((m) => ({
        id: m.id,
        direction: m.direction,
        type: m.type,
        content: m.content,
        occurredAt: m.occurredAt.toISOString(),
        origin: (m.raw as { origin?: string }).origin ?? null,
      })),
    };
  });

  app.post('/conversations/:waId/messages', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { waId } = request.params as { waId: string };
    const parsed = sendReplyRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const confirmTakeover = (request.query as { takeover?: string }).takeover === 'true';

    try {
      const result = await deps.conversations.reply(tenantId, waId, parsed.data.text, confirmTakeover);
      if (result.needsConfirm) {
        return reply.code(409).send({ needsConfirm: true, reason: 'thread is bot-active' });
      }
      return reply.code(200).send({
        id: result.eventId,
        delivery: result.delivery,
        windowOpen: result.windowOpen,
      });
    } catch (err) {
      return reply.code(502).send({ delivery: 'failed', error: err instanceof Error ? err.message : 'send failed' });
    }
  });

  app.post('/conversations/:waId/read', async (request, reply) => {
    const { waId } = request.params as { waId: string };
    await deps.conversations.markRead(request.auth!.tenantId, waId);
    return reply.code(200).send({ ok: true });
  });

  app.post('/conversations/:waId/takeover', async (request, reply) => {
    const { waId } = request.params as { waId: string };
    const until = new Date(now().getTime() + 24 * 3600 * 1000);
    await deps.conversations.takeover(request.auth!.tenantId, waId, until);
    return reply.code(200).send({ pausedUntil: until.toISOString() });
  });

  app.delete('/conversations/:waId/takeover', async (request, reply) => {
    const { waId } = request.params as { waId: string };
    await deps.conversations.resume(request.auth!.tenantId, waId);
    return reply.code(200).send({ resumed: true });
  });

  app.post('/conversations/:waId/block', async (request, reply) => {
    const { waId } = request.params as { waId: string };
    const parsed = blockThreadRequestSchema.safeParse(request.body ?? {});
    const purge = parsed.success ? Boolean(parsed.data.purgeHistory) : false;
    await deps.conversations.blockAndPurge(request.auth!.tenantId, waId, purge);
    return reply.code(200).send({ blocked: true, purged: purge });
  });
}
