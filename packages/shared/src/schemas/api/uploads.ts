/**
 * Contracts for the dashboard audio upload path (docs/01 §7, docs/03 Phase 2).
 * presign → client PUTs to R2 → complete registers the media + event.
 */
import { z } from 'zod';

export const presignRequestSchema = z.object({
  mime: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: z.string().length(64).optional(),
});
export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const presignResponseSchema = z.object({
  uploadUrl: z.string().url(),
  key: z.string().min(1),
  expiresInSec: z.number().int().positive(),
});
export type PresignResponse = z.infer<typeof presignResponseSchema>;

export const uploadCompleteRequestSchema = z.object({
  key: z.string().min(1),
  mime: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: z.string().length(64),
  durationSec: z.number().positive().optional(),
});
export type UploadCompleteRequest = z.infer<typeof uploadCompleteRequestSchema>;

export const uploadCompleteResponseSchema = z.object({
  eventId: z.string().uuid(),
  mediaAssetId: z.string().uuid(),
});
export type UploadCompleteResponse = z.infer<typeof uploadCompleteResponseSchema>;
