import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { BodyLog, Entry } from '@lean/shared';
import { api } from '../../lib/api';
import { getToken } from '../../lib/session';
import { useToast } from '../../components/ui/Toast';
import { activeGoalKey } from '../goals/api';
import { bodyFields, type ProgressLog } from './calc';

const saveKey = ['body-logs', 'save'] as const;
const writes = new WeakMap<QueryClient, Map<string, Promise<BodyLog>>>();

export const bodyLogsKey = ['body-logs'] as const;
export const bodyRangeKey = (from: string, to: string) => [...bodyLogsKey, from, to] as const;
export function useBodyLogs(from: string, to: string) {
  return useQuery({
    queryKey: bodyRangeKey(from, to),
    queryFn: ({ signal }) =>
      api.get<{ logs: ProgressLog[] }>(`/api/body-logs?from=${from}&to=${to}`, { signal }),
    staleTime: 60_000,
  });
}
export function useProgressEntries(from: string, to: string) {
  return useQuery({
    queryKey: ['progress', 'entries', from, to],
    queryFn: ({ signal }) => api.get<Entry[]>(`/api/entries?from=${from}&to=${to}`, { signal }),
  });
}
export function useLogWeight() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationKey: saveKey,
    mutationFn: async ({
      date,
      values,
    }: {
      date: string;
      values: Partial<Record<(typeof bodyFields)[number]['key'], number | undefined>>;
    }) => {
      const token = getToken();
      let requests = writes.get(client);
      if (!requests) {
        requests = new Map();
        writes.set(client, requests);
      }
      const request = (requests.get(date) ?? Promise.resolve())
        .catch(() => {})
        .then(() => {
          if (getToken() !== token) throw new Error('La sesión cambió.');
          return api.put<BodyLog>(`/api/body-logs/${date}`, values);
        });
      requests.set(date, request);
      try {
        return await request;
      } finally {
        if (requests.get(date) === request) requests.delete(date);
      }
    },
    onMutate: async ({ date, values }) => {
      const token = getToken();
      await client.cancelQueries({ queryKey: bodyLogsKey });
      if (getToken() !== token) return { token, previous: [] };
      const cached = client.getQueriesData<{ logs: ProgressLog[] }>({ queryKey: bodyLogsKey });
      const previous: { key: readonly unknown[]; log: ProgressLog | undefined }[] = [];
      for (const [key, data] of cached) {
        if (!data || date < String(key[1]) || date > String(key[2])) continue;
        const existing = data.logs.find((l) => l.date === date);
        previous.push({ key, log: existing });
        const empty = Object.fromEntries(bodyFields.map((f) => [f.key, null])) as Omit<
          BodyLog,
          'date'
        >;
        const log = { ...empty, trendWeightKg: null, ...existing, date, ...values };
        client.setQueryData(key, {
          logs: [...data.logs.filter((l) => l.date !== date), log].sort((a, b) =>
            a.date.localeCompare(b.date),
          ),
        });
      }
      return { token, previous };
    },
    onError: (_error, { date }, context) => {
      if (!context || getToken() !== context.token) return;
      context.previous.forEach(({ key, log }) =>
        client.setQueryData<{ logs: ProgressLog[] }>(key, (current) =>
          current
            ? {
                ...current,
                logs: [
                  ...current.logs.filter((row) => row.date !== date),
                  ...(log ? [log] : []),
                ].sort((a, b) => a.date.localeCompare(b.date)),
              }
            : current,
        ),
      );
      toast('No se pudo guardar el registro. Revisá tu conexión y volvé a intentarlo.');
    },
    onSettled: (_data, _error, _variables, context) => {
      if (
        !context ||
        getToken() !== context.token ||
        client.isMutating({ mutationKey: saveKey }) !== 1
      )
        return;
      return Promise.all([
        client.invalidateQueries({ queryKey: bodyLogsKey }),
        client.invalidateQueries({ queryKey: activeGoalKey }),
      ]);
    },
  });
}
