import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BodyLog, Entry } from '@lean/shared';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import { activeGoalKey } from '../goals/api';
import { bodyFields, type ProgressLog } from './calc';

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
    mutationFn: ({
      date,
      values,
    }: {
      date: string;
      values: Partial<Record<(typeof bodyFields)[number]['key'], number | undefined>>;
    }) => api.put<BodyLog>(`/api/body-logs/${date}`, values),
    onMutate: async ({ date, values }) => {
      await client.cancelQueries({ queryKey: bodyLogsKey });
      const previous = client.getQueriesData<{ logs: ProgressLog[] }>({ queryKey: bodyLogsKey });
      for (const [key, data] of previous) {
        if (!data || date < String(key[1]) || date > String(key[2])) continue;
        const existing = data.logs.find((l) => l.date === date);
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
      return { previous };
    },
    onError: (_error, _variables, context) => {
      context?.previous.forEach(([key, data]) => client.setQueryData(key, data));
      toast('No se pudo guardar el registro. Revisá tu conexión y volvé a intentarlo.');
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: bodyLogsKey }),
        client.invalidateQueries({ queryKey: activeGoalKey }),
      ]),
  });
}
