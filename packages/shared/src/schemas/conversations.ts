/** Conversations contracts (docs/00 F8, docs/02 §5). Threads derived from events by senderWaId. */
import { z } from 'zod';

export const conversationFilterSchema = z.enum(['all', 'personal', 'bot']);
export type ConversationFilter = z.infer<typeof conversationFilterSchema>;

export const threadSchema = z.object({
  waId: z.string(),
  /** Operator-assigned name; wins over profileName for display. */
  label: z.string().nullable(),
  /** WhatsApp profile name as sent by Meta. */
  profileName: z.string().nullable(),
  lastMessage: z.string().nullable(),
  lastAt: z.string().datetime().nullable(),
  unreadCount: z.number().int().nonnegative(),
  botActive: z.boolean(),
});
export type Thread = z.infer<typeof threadSchema>;

export const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound', 'system']),
  type: z.string(),
  content: z.string().nullable(),
  occurredAt: z.string().datetime(),
  /** Message origin label, e.g. 'operator' for replies Recall sent. */
  origin: z.string().nullable(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const sendReplyRequestSchema = z.object({ text: z.string().min(1).max(4096) });
export type SendReplyRequest = z.infer<typeof sendReplyRequestSchema>;

export const sendReplyResponseSchema = z.object({
  id: z.string().uuid(),
  delivery: z.enum(['sent', 'template', 'failed']),
  windowOpen: z.boolean(),
  reason: z.string().optional(),
});
export type SendReplyResponse = z.infer<typeof sendReplyResponseSchema>;

export const blockThreadRequestSchema = z.object({ purgeHistory: z.boolean().optional() });
export type BlockThreadRequest = z.infer<typeof blockThreadRequestSchema>;
