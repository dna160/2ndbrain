/**
 * @CLAUDE_CONTEXT · /v1/tasks — list + status patch for the Actions view (docs/02 §5).
 */
import { taskPatchSchema } from '@recall/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Database } from '../../db/client';
import { tasks } from '../../db/schema';

type TaskRow = typeof tasks.$inferSelect;

function serialize(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt?.toISOString() ?? null,
    meetingId: t.meetingId,
    ownerEntityId: t.ownerEntityId,
  };
}

export function registerTaskRoutes(app: FastifyInstance, db: Database): void {
  app.get('/tasks', async (request) => {
    const tenantId = request.auth!.tenantId;
    const rows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.tenantId, tenantId))
      .orderBy(desc(tasks.createdAt));
    return { items: rows.map(serialize) };
  });

  app.patch('/tasks/:id', async (request, reply) => {
    const tenantId = request.auth!.tenantId;
    const { id } = request.params as { id: string };
    const parsed = taskPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' });
    const rows = await db
      .update(tasks)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(tasks.tenantId, tenantId), eq(tasks.id, id)))
      .returning();
    if (rows.length === 0) return reply.code(404).send({ error: 'task not found' });
    return serialize(rows[0]!);
  });
}
