'use client';
/** TanStack Query hooks — the dashboard's read/write data layer over the typed API client. */
import {
  confirmParticipantRequestSchema,
  conversationMessageSchema,
  eventListItemSchema,
  listOf,
  meetingDetailSchema,
  meetingListItemSchema,
  pipelineRunListItemSchema,
  queueDepthSchema,
  digestDetailSchema,
  digestListItemSchema,
  graphSchema,
  memoryDtoSchema,
  memoryReviewDtoSchema,
  sendReplyResponseSchema,
  taskListItemSchema,
  taskPatchSchema,
  threadSchema,
  upcomingResponseSchema,
  type ConfirmParticipantRequest,
  type ConversationFilter,
} from '@recall/shared';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { API_URL, apiFetch } from './api';

function useToken() {
  const { getToken } = useAuth();
  return getToken;
}

export function useMeetings() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['meetings'],
    queryFn: async () =>
      (await apiFetch('/v1/meetings', listOf(meetingListItemSchema), { token: await getToken() })).items,
  });
}

export function useMeeting(id: string) {
  const getToken = useToken();
  return useQuery({
    queryKey: ['meeting', id],
    queryFn: async () => apiFetch(`/v1/meetings/${id}`, meetingDetailSchema, { token: await getToken() }),
  });
}

export function useTasks() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () =>
      (await apiFetch('/v1/tasks', listOf(taskListItemSchema), { token: await getToken() })).items,
  });
}

export function useEvents() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['events'],
    queryFn: async () =>
      (await apiFetch('/v1/events', listOf(eventListItemSchema), { token: await getToken() })).items,
  });
}

export function usePipelineRuns() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['pipeline', 'runs'],
    queryFn: async () =>
      (await apiFetch('/v1/pipeline/runs', listOf(pipelineRunListItemSchema), { token: await getToken() }))
        .items,
  });
}

export function useQueueDepths() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['pipeline', 'queues'],
    queryFn: async () =>
      (await apiFetch('/v1/pipeline/queues', listOf(queueDepthSchema), { token: await getToken() })).items,
    refetchInterval: 5000, // docs/02 §5: 5s poll on queue depths only
  });
}

const confirmResponse = z.object({ entityId: z.string() });

export function useConfirmSpeaker(meetingId: string) {
  const getToken = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ speakerKey, body }: { speakerKey: string; body: ConfirmParticipantRequest }) => {
      confirmParticipantRequestSchema.parse(body);
      return apiFetch(`/v1/meetings/${meetingId}/participants/${speakerKey}/confirm`, confirmResponse, {
        method: 'POST',
        body,
        token: await getToken(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['meeting', meetingId] }),
  });
}

export function usePatchTask() {
  const getToken = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'open' | 'done' | 'dropped' }) => {
      taskPatchSchema.parse({ status });
      return apiFetch(`/v1/tasks/${id}`, taskListItemSchema, {
        method: 'PATCH',
        body: { status },
        token: await getToken(),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useRetryRun() {
  const getToken = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/v1/pipeline/runs/${id}/retry`, z.object({ retried: z.boolean() }), {
        method: 'POST',
        token: await getToken(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipeline', 'runs'] }),
  });
}

// ── Calendar / Upcoming ─────────────────────────────────────────────────────
export function useUpcoming() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['upcoming'],
    queryFn: async () => apiFetch('/v1/calendar/upcoming', upcomingResponseSchema, { token: await getToken() }),
  });
}

export function useResolveDraft() {
  const getToken = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'confirm' | 'reject' }) =>
      apiFetch(`/v1/calendar/drafts/${id}/${decision}`, z.record(z.unknown()), {
        method: 'POST',
        token: await getToken(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upcoming'] }),
  });
}

// ── Conversations ───────────────────────────────────────────────────────────
export function useThreads(filter: ConversationFilter) {
  const getToken = useToken();
  return useQuery({
    queryKey: ['threads', filter],
    queryFn: async () =>
      (await apiFetch(`/v1/conversations?filter=${filter}`, listOf(threadSchema), { token: await getToken() }))
        .items,
  });
}

export function useThreadMessages(waId: string) {
  const getToken = useToken();
  return useQuery({
    queryKey: ['thread', waId],
    queryFn: async () =>
      (
        await apiFetch(`/v1/conversations/${waId}/messages`, listOf(conversationMessageSchema), {
          token: await getToken(),
        })
      ).items,
  });
}

export type SendReplyOutcome = { needsConfirm: true } | { needsConfirm: false; delivery: string };

export function useSendReply(waId: string) {
  const getToken = useToken();
  const qc = useQueryClient();
  return useMutation<SendReplyOutcome, Error, { text: string; takeover?: boolean }>({
    mutationFn: async ({ text, takeover }) => {
      const res = await fetch(
        `${API_URL}/v1/conversations/${waId}/messages?takeover=${takeover ? 'true' : 'false'}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${await getToken()}` },
          body: JSON.stringify({ text }),
        },
      );
      if (res.status === 409) return { needsConfirm: true };
      if (!res.ok) throw new Error(`send failed: ${res.status}`);
      const parsed = sendReplyResponseSchema.parse(await res.json());
      return { needsConfirm: false, delivery: parsed.delivery };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thread', waId] }),
  });
}

// ── Memory ──────────────────────────────────────────────────────────────────
export function useMemories(q: string) {
  const getToken = useToken();
  return useQuery({
    queryKey: ['memories', q],
    queryFn: async () =>
      (await apiFetch(`/v1/memory/search?q=${encodeURIComponent(q)}`, listOf(memoryDtoSchema), { token: await getToken() }))
        .items,
  });
}

export function useReviews() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['reviews'],
    queryFn: async () =>
      (await apiFetch('/v1/memory/reviews', listOf(memoryReviewDtoSchema), { token: await getToken() })).items,
  });
}

export function useGraph() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['graph'],
    queryFn: async () => apiFetch('/v1/memory/graph', graphSchema, { token: await getToken() }),
  });
}

export function useResolveReview() {
  const getToken = useToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolution, content }: { id: string; resolution: 'approved' | 'edited' | 'rejected'; content?: string }) =>
      apiFetch(`/v1/memory/reviews/${id}/resolve`, z.object({ resolved: z.boolean() }), {
        method: 'POST',
        body: { resolution, content },
        token: await getToken(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      void qc.invalidateQueries({ queryKey: ['memories'] });
    },
  });
}

// ── Digests ─────────────────────────────────────────────────────────────────
export function useDigests() {
  const getToken = useToken();
  return useQuery({
    queryKey: ['digests'],
    queryFn: async () =>
      (await apiFetch('/v1/digests', listOf(digestListItemSchema), { token: await getToken() })).items,
  });
}

export function useDigest(id: string | null) {
  const getToken = useToken();
  return useQuery({
    queryKey: ['digest', id],
    enabled: Boolean(id),
    queryFn: async () => apiFetch(`/v1/digests/${id}`, digestDetailSchema, { token: await getToken() }),
  });
}

export function useResendDigest() {
  const getToken = useToken();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/v1/digests/${id}/resend`, z.object({ deliveredVia: z.string() }), {
        method: 'POST',
        token: await getToken(),
      }),
  });
}
