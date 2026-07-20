'use client';
/** TanStack Query hooks — the dashboard's read/write data layer over the typed API client. */
import {
  confirmParticipantRequestSchema,
  eventListItemSchema,
  listOf,
  meetingDetailSchema,
  meetingListItemSchema,
  pipelineRunListItemSchema,
  queueDepthSchema,
  taskListItemSchema,
  taskPatchSchema,
  type ConfirmParticipantRequest,
} from '@recall/shared';
import { useAuth } from '@clerk/nextjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { apiFetch } from './api';

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
