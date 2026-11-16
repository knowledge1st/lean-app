import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { addWaterSchema, type DaySummary, type ExerciseLog } from '@lean/shared';
import { api, ApiError } from '../../lib/api';
import { getToken } from '../../lib/session';
import { useToast } from '../../components/ui/Toast';
import { summaryKey } from './api';

export const waterKey = (date: string) => ['water', date] as const;
export const exerciseKey = (date: string) => ['exercise', date] as const;
type Water = { date: string; ml: number };
type PendingWater = { ml: number };
type WaterQueue = { base: number; pending: PendingWater[]; tail: Promise<unknown> };
const queues = new WeakMap<QueryClient, { token: string | null; days: Map<string, WaterQueue> }>();
function session(client: QueryClient) {
  let value = queues.get(client);
  if (!value || value.token !== getToken()) {
    value = { token: getToken(), days: new Map() };
    queues.set(client, value);
  }
  return value;
}
export function useWater(date: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: waterKey(date),
    queryFn: ({ signal }) => {
      const cached = client.getQueryData<Water>(waterKey(date));
      if (session(client).days.has(date) && cached) return cached;
      return api.get<Water>(`/api/water?date=${date}`, { signal });
    },
  });
}

// Optimism is synchronous; requests are serialized per date, including undo.
export function useWaterMutation(date: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useCallback(
    (ml: number, prerequisite?: Promise<boolean>): Promise<boolean> => {
      const body = addWaterSchema.parse({ date, ml });
      const currentSession = session(client);
      let queue = currentSession.days.get(date);
      if (!queue) {
        queue = {
          base: client.getQueryData<Water>(waterKey(date))?.ml ?? 0,
          pending: [],
          tail: Promise.resolve(),
        };
        currentSession.days.set(date, queue);
      }
      const day = queue;
      const action = { ml };
      day.pending.push(action);
      const active = () => session(client) === currentSession;
      const publish = () => {
        if (!active()) return;
        const total = day.pending.reduce((value, item) => Math.max(0, value + item.ml), day.base);
        client.setQueryData<Water>(waterKey(date), { date, ml: total });
        client.setQueryData<DaySummary>(summaryKey(date), (old) =>
          old ? { ...old, waterMl: total } : old,
        );
      };
      void client.cancelQueries({ queryKey: waterKey(date) });
      void client.cancelQueries({ queryKey: summaryKey(date) });
      publish();
      const request = day.tail.then(async () => {
        if (!active()) return false;
        let success = false;
        try {
          if (!prerequisite || (await prerequisite)) {
            const result = await api.post<Water>('/api/water', body);
            day.base = result.ml;
            success = true;
          }
        } catch (error) {
          if (active())
            toast(
              error instanceof ApiError && error.code === 'water_limit'
                ? 'Llegaste al máximo de agua del día'
                : 'No se pudo guardar el agua. Revisá tu conexión e intentá de nuevo.',
            );
        } finally {
          day.pending = day.pending.filter((item) => item !== action);
          publish();
          if (active() && !day.pending.length) {
            currentSession.days.delete(date);
            void client.invalidateQueries({ queryKey: summaryKey(date) });
          }
        }
        return success;
      });
      day.tail = request;
      return request;
    },
    [client, date, toast],
  );
}

export function useExercise(date: string) {
  return useQuery({
    queryKey: exerciseKey(date),
    queryFn: ({ signal }) =>
      api.get<{ logs: ExerciseLog[] }>(`/api/exercise?from=${date}&to=${date}`, { signal }),
  });
}
type ExerciseFields = { activity: string; minutes: number; kcal: number };
export type ExerciseAction =
  | { kind: 'add'; fields: ExerciseFields }
  | { kind: 'edit'; id: string; fields: ExerciseFields }
  | { kind: 'delete'; id: string };
export function useExerciseMutation(date: string) {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    networkMode: 'always',
    mutationFn: async (action: ExerciseAction) => {
      const token = getToken();
      const log =
        action.kind === 'delete'
          ? await api.delete<void>(`/api/exercise/${action.id}`)
          : action.kind === 'add'
            ? await api.post<ExerciseLog>('/api/exercise', { date, ...action.fields })
            : await api.patch<ExerciseLog>(`/api/exercise/${action.id}`, action.fields);
      return { log, token };
    },
    onSuccess: async ({ log, token }, action) => {
      if (token !== getToken()) return;
      await client.cancelQueries({ queryKey: exerciseKey(date) });
      client.setQueryData<{ logs: ExerciseLog[] }>(exerciseKey(date), (old) => ({
        logs:
          action.kind === 'add'
            ? [...(old?.logs ?? []), ...(log ? [log] : [])]
            : (old?.logs ?? []).flatMap((item) =>
                item.id !== action.id ? [item] : log ? [log] : [],
              ),
      }));
      void client.invalidateQueries({ queryKey: summaryKey(date) });
    },
    onError: () => toast('No se pudo guardar el ejercicio. Intentá de nuevo.'),
  });
}
