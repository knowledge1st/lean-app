import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { BodyLog, Entry } from '@lean/shared';
import { api } from '../../lib/api';
import { getToken } from '../../lib/session';
import { useToast } from '../../components/ui/Toast';
import { activeGoalKey } from '../goals/api';
import { bodyFields, type ProgressLog } from './calc';

const saveKey = ['body-logs', 'save'] as const;
const writes = new WeakMap<QueryClient, Map<string, Promise<BodyLog>>>();
type WeightSave = {
  date: string;
  values: Partial<Record<(typeof bodyFields)[number]['key'], number | undefined>>;
};
type DateSaves = {
  token: string | null;
  confirmed: ProgressLog | undefined;
  pending: { id: symbol; values: WeightSave['values'] }[];
};
type SaveContext = { id: symbol; state: DateSaves };
const saves = new WeakMap<QueryClient, Map<string, DateSaves>>();
const empty = Object.fromEntries(bodyFields.map((f) => [f.key, null])) as Omit<BodyLog, 'date'>;

function recalculate(client: QueryClient, date: string, state: DateSaves) {
  let log = state.confirmed;
  for (const { values } of state.pending) {
    log = { ...empty, trendWeightKg: null, ...log, date };
    for (const { key } of bodyFields) {
      log[key] = values[key] ?? log[key];
    }
  }
  for (const [key, data] of client.getQueriesData<{ logs: ProgressLog[] }>({
    queryKey: bodyLogsKey,
  })) {
    if (!data || date < String(key[1]) || date > String(key[2])) continue;
    client.setQueryData(key, {
      ...data,
      logs: [...data.logs.filter((row) => row.date !== date), ...(log ? [log] : [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    });
  }
}

function finishSave(client: QueryClient, date: string, context: SaveContext, data?: BodyLog) {
  const { id, state } = context;
  state.pending = state.pending.filter((pending) => pending.id !== id);
  if (getToken() === state.token && saves.get(client)?.get(date) === state) {
    if (data) {
      state.confirmed = {
        ...state.confirmed,
        ...data,
        trendWeightKg: state.confirmed?.trendWeightKg ?? null,
      };
    }
    recalculate(client, date, state);
  }
  if (!state.pending.length && saves.get(client)?.get(date) === state) {
    saves.get(client)?.delete(date);
  }
}

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
  const mutation = useMutation({
    mutationKey: saveKey,
    mutationFn: async ({ date, values, token }: WeightSave & { token: string | null }) => {
      let requests = writes.get(client);
      if (!requests) {
        requests = new Map();
        writes.set(client, requests);
      }
      const request = (requests.get(date) ?? Promise.resolve())
        .catch(() => {})
        .then(() => {
          if (getToken() !== token) throw new Error('La sesión cambió.');
          return api.put<BodyLog>(`/api/body-logs/${date}`, values, { token: token ?? '' });
        });
      requests.set(date, request);
      try {
        return await request;
      } finally {
        if (requests.get(date) === request) requests.delete(date);
      }
    },
    onMutate: async ({ date, values, token }) => {
      await client.cancelQueries({ queryKey: bodyLogsKey });
      if (getToken() !== token) return;
      let dates = saves.get(client);
      if (!dates) {
        dates = new Map();
        saves.set(client, dates);
      }
      let state = dates.get(date);
      if (!state || state.token !== token) {
        const cached = client.getQueriesData<{ logs: ProgressLog[] }>({ queryKey: bodyLogsKey });
        const confirmed = cached
          .filter(([key, data]) => data && date >= String(key[1]) && date <= String(key[2]))
          .flatMap(([, data]) => data!.logs)
          .find((row) => row.date === date);
        state = { token, confirmed, pending: [] };
        dates.set(date, state);
      }
      const id = Symbol();
      state.pending.push({ id, values });
      recalculate(client, date, state);
      return { id, state };
    },
    onSuccess: (data, { date }, context) => {
      if (context) finishSave(client, date, context, data);
    },
    onError: (_error, { date }, context) => {
      if (!context) return;
      finishSave(client, date, context);
      if (getToken() !== context.state.token) return;
      toast('No se pudo guardar el registro. Revisá tu conexión y volvé a intentarlo.');
    },
    onSettled: (_data, _error, _variables, context) => {
      if (
        !context ||
        getToken() !== context.state.token ||
        client.isMutating({ mutationKey: saveKey }) !== 1
      )
        return;
      return Promise.all([
        client.invalidateQueries({ queryKey: bodyLogsKey }),
        client.invalidateQueries({ queryKey: activeGoalKey }),
      ]);
    },
  });
  return {
    ...mutation,
    mutate: (variables: WeightSave, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ ...variables, token: getToken() }, options),
    mutateAsync: (variables: WeightSave, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync({ ...variables, token: getToken() }, options),
  };
}
