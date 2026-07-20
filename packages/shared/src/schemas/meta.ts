/**
 * Contracts for the Lynkbot relay → /ingest/wa path (docs/00 F1, docs/01 §3.4).
 * The raw Meta webhook body is loosely typed; extraction narrows it to ExtractedMessage.
 */
import { z } from 'zod';

/** Recall's persisted event type (subset of Meta message kinds). */
export const ingestEventTypeSchema = z.enum(['message', 'audio', 'image', 'document']);
export type IngestEventType = z.infer<typeof ingestEventTypeSchema>;

/** One inbound message normalized out of a Meta webhook payload. */
export const extractedMessageSchema = z.object({
  metaMessageId: z.string().min(1),
  senderWaId: z.string().min(1),
  phoneNumberId: z.string().nullable(),
  eventType: ingestEventTypeSchema,
  /** Original Meta `message.type` (e.g. "voice", "video") for provenance. */
  rawType: z.string(),
  content: z.string().nullable(),
  mediaId: z.string().nullable(),
  mime: z.string().nullable(),
  occurredAt: z.string().datetime(),
});
export type ExtractedMessage = z.infer<typeof extractedMessageSchema>;

/** Response of POST /ingest/wa — a per-payload ingestion summary. */
export const ingestResponseSchema = z.object({
  received: z.literal(true),
  persisted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
});
export type IngestResponse = z.infer<typeof ingestResponseSchema>;
