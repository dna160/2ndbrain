/**
 * Meeting Note contracts (docs/00 F2, docs/04 §1). `structuringOutput*` is what the LLM
 * emits (validated by parseStructured); the meeting API shapes are what apps/web consumes.
 */
import { z } from 'zod';

// ── Structuring LLM output ────────────────────────────────────────────────────
export const structuringTopicSchema = z.object({
  title: z.string().min(1).max(120),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  subnotes: z.array(z.string()),
});
export type StructuringTopic = z.infer<typeof structuringTopicSchema>;

export const structuringActionSchema = z.object({
  title: z.string().min(1),
  owner: z.string().nullable(),
  deadline: z.string().nullable(), // ISO date or null
});
export type StructuringAction = z.infer<typeof structuringActionSchema>;

export const structuringSpeakerSchema = z.object({
  speakerKey: z.string().min(1),
  suggestedName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().nullable(),
});

export const structuringRecommendationSchema = z.object({
  speakerKey: z.string().min(1),
  advice: z.string().min(1),
});

export const structuringOutputSchema = z.object({
  topics: z.array(structuringTopicSchema),
  summary: z.string(),
  decisions: z.array(z.string()),
  actions: z.array(structuringActionSchema),
  openQuestions: z.array(z.string()),
  speakers: z.array(structuringSpeakerSchema),
  attributionConfidence: z.number().min(0).max(1),
  recommendations: z.array(structuringRecommendationSchema),
});
export type StructuringOutput = z.infer<typeof structuringOutputSchema>;

// ── Meeting API ───────────────────────────────────────────────────────────────
export const meetingListItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  occurredAt: z.string().datetime(),
  durationSec: z.number().nullable(),
  participantCount: z.number().int().nonnegative(),
  attributionConfidence: z.number().nullable(),
});
export type MeetingListItem = z.infer<typeof meetingListItemSchema>;

export const meetingParticipantSchema = z.object({
  speakerKey: z.string(),
  entityId: z.string().uuid().nullable(),
  suggestedName: z.string().nullable(),
  confirmed: z.boolean(),
  confidence: z.number(),
});

export const meetingDetailSchema = meetingListItemSchema.extend({
  transcriptId: z.string().uuid(),
  participants: z.array(meetingParticipantSchema),
  topics: z.array(structuringTopicSchema),
  summary: z.string().nullable(),
  decisions: z.array(z.string()),
  openQuestions: z.array(z.string()),
  recommendations: z.array(
    z.object({ speakerKey: z.string(), entityId: z.string().uuid().nullable(), advice: z.string() }),
  ),
});
export type MeetingDetail = z.infer<typeof meetingDetailSchema>;

export const confirmParticipantRequestSchema = z
  .object({
    entityId: z.string().uuid().optional(),
    newEntityName: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.entityId) !== Boolean(v.newEntityName), {
    message: 'provide exactly one of entityId or newEntityName',
  });
export type ConfirmParticipantRequest = z.infer<typeof confirmParticipantRequestSchema>;
