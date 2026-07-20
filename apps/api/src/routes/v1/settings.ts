/**
 * /v1/settings/* — blacklist + contact registry CRUD over waContacts (docs/01 §7, Phase 1).
 * Every query is tenant-scoped from request.auth.tenantId. Requests validate against the
 * @recall/shared zod contracts.
 */
import {
  blockRequestSchema,
  updateContactRequestSchema,
  type WaContact,
} from '@recall/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodType } from 'zod';

import type { Database } from '../../db/client';
import { waContacts } from '../../db/schema';

type WaContactRow = typeof waContacts.$inferSelect;

function serialize(row: WaContactRow): WaContact {
  return {
    id: row.id,
    waId: row.waId,
    label: row.label,
    blocked: row.blocked,
    botActiveUntil: row.botActiveUntil?.toISOString() ?? null,
    lastInboundAt: row.lastInboundAt?.toISOString() ?? null,
    purgedAt: row.purgedAt?.toISOString() ?? null,
  };
}

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw Object.assign(new Error('invalid request body'), {
      statusCode: 400,
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function registerSettingsRoutes(app: FastifyInstance, db: Database): void {
  // GET blacklist — blocked contacts only
  app.get('/settings/blacklist', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await db
      .select()
      .from(waContacts)
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.blocked, true)));
    return { items: rows.map(serialize) };
  });

  // POST blacklist — block a waId (upsert)
  app.post('/settings/blacklist', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { waId } = parseBody(blockRequestSchema, request.body);
    const rows = await db
      .insert(waContacts)
      .values({ tenantId, waId, blocked: true })
      .onConflictDoUpdate({
        target: waContacts.waId,
        set: { blocked: true, updatedAt: new Date() },
      })
      .returning();
    return reply.code(201).send(serialize(rows[0]!));
  });

  // DELETE blacklist/:waId — unblock
  app.delete('/settings/blacklist/:waId', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { waId } = request.params as { waId: string };
    const rows = await db
      .update(waContacts)
      .set({ blocked: false, updatedAt: new Date() })
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)))
      .returning();
    if (rows.length === 0) return reply.code(404).send({ error: 'contact not found' });
    return serialize(rows[0]!);
  });

  // GET contacts — full registry
  app.get('/settings/contacts', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await db.select().from(waContacts).where(eq(waContacts.tenantId, tenantId));
    return { items: rows.map(serialize) };
  });

  // PATCH contacts/:waId — set label
  app.patch('/settings/contacts/:waId', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { waId } = request.params as { waId: string };
    const { label } = parseBody(updateContactRequestSchema, request.body);
    const rows = await db
      .update(waContacts)
      .set({ label, updatedAt: new Date() })
      .where(and(eq(waContacts.tenantId, tenantId), eq(waContacts.waId, waId)))
      .returning();
    if (rows.length === 0) return reply.code(404).send({ error: 'contact not found' });
    return serialize(rows[0]!);
  });
}
