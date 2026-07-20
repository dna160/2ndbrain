/** List/read contracts for the dashboard views (docs/01 §7, docs/03 Phase 4). */
import { z } from 'zod';

import { STAGES } from '../../constants';

// Today — event timeline
export const eventListItemSchema = z.object({
  id: z.string().uuid(),
  source: z.string(),
  type: z.string(),
  direction: z.string(),
  senderWaId: z.string().nullable(),
  content: z.string().nullable(),
  occurredAt: z.string().datetime(),
});
export type EventListItem = z.infer<typeof eventListItemSchema>;

// Actions — tasks
export const taskListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(['open', 'done', 'dropped']),
  dueAt: z.string().datetime().nullable(),
  meetingId: z.string().uuid().nullable(),
  ownerEntityId: z.string().uuid().nullable(),
});
export type TaskListItem = z.infer<typeof taskListItemSchema>;

export const taskPatchSchema = z.object({ status: z.enum(['open', 'done', 'dropped']) });
export type TaskPatch = z.infer<typeof taskPatchSchema>;

// Pipeline — runs + queue depths
export const pipelineStageEntrySchema = z.object({
  stage: z.enum(STAGES),
  at: z.string(),
  ms: z.number(),
  ok: z.boolean(),
  err: z.string().optional(),
});

export const pipelineRunListItemSchema = z.object({
  id: z.string().uuid(),
  jobType: z.string(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  status: z.enum(['running', 'done', 'failed', 'dead']),
  stages: z.array(pipelineStageEntrySchema),
  costIdr: z.number().int(),
  attempts: z.number().int(),
  createdAt: z.string().datetime(),
});
export type PipelineRunListItem = z.infer<typeof pipelineRunListItemSchema>;

export const queueDepthSchema = z.object({
  queue: z.string(),
  waiting: z.number().int(),
  active: z.number().int(),
  failed: z.number().int(),
});
export type QueueDepth = z.infer<typeof queueDepthSchema>;

// generic list wrapper
export const listOf = <T extends z.ZodTypeAny>(item: T) => z.object({ items: z.array(item) });
