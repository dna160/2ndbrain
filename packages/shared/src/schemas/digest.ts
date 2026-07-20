/** Nightly digest contracts (docs/00 F5, docs/04 §5). Every claim carries provenance. */
import { z } from 'zod';

const provenanceItem = z.object({
  text: z.string().min(1),
  provenanceEventIds: z.array(z.string()).min(1), // an item you cannot source does not exist
});

export const digestRecommendationSchema = z.object({
  kind: z.enum(['book', 'reply', 'prepare', 'decide']),
  text: z.string().min(1),
  urgency: z.number().int().min(1).max(3),
  provenanceEventIds: z.array(z.string()).min(1),
  draftPayload: z
    .object({
      title: z.string(),
      startISO: z.string(),
      endISO: z.string(),
      attendees: z.array(z.string()).optional(),
    })
    .optional(),
});

export const digestOutputSchema = z.object({
  happened: z.array(provenanceItem),
  commitmentsByMe: z.array(provenanceItem),
  commitmentsToMe: z.array(provenanceItem),
  conflicts: z.array(provenanceItem),
  recommendations: z.array(digestRecommendationSchema),
});
export type DigestOutput = z.infer<typeof digestOutputSchema>;

export const digestListItemSchema = z.object({
  id: z.string().uuid(),
  date: z.string(),
  deliveredVia: z.enum(['freeform', 'template', 'none']),
});
export type DigestListItem = z.infer<typeof digestListItemSchema>;

export const digestDetailSchema = digestListItemSchema.extend({
  content: digestOutputSchema,
});
export type DigestDetail = z.infer<typeof digestDetailSchema>;
