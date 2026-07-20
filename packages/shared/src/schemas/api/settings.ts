/**
 * API contracts for /v1/settings/* (docs/01 §7, Phase 1).
 * The api validates against these; the web imports the inferred types.
 */
import { z } from 'zod';

export const waContactSchema = z.object({
  id: z.string().uuid(),
  waId: z.string().min(1),
  label: z.string().nullable(),
  blocked: z.boolean(),
  botActiveUntil: z.string().datetime().nullable(),
  lastInboundAt: z.string().datetime().nullable(),
  purgedAt: z.string().datetime().nullable(),
});
export type WaContact = z.infer<typeof waContactSchema>;

export const waContactListSchema = z.object({ items: z.array(waContactSchema) });
export type WaContactList = z.infer<typeof waContactListSchema>;

export const blockRequestSchema = z.object({ waId: z.string().min(1) });
export type BlockRequest = z.infer<typeof blockRequestSchema>;

export const updateContactRequestSchema = z.object({ label: z.string().min(1).max(120) });
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;
