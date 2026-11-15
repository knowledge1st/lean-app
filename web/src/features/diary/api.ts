import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DaySummary, Entry } from '@lean/shared';
import { api, ApiError } from '../../lib/api';
import { getToken } from '../../lib/session';
import { useToast } from '../../components/ui/Toast';
import {
  applyPendingDiaryActions,
  incorporateDiaryResult,
  type DiaryAction,
  type EntryChanges,
} from './optimistic';
export const summaryKey = (date: string) => ['summary', 'day', date] as const;
export const getDaySummary = (date: string, signal?: AbortSignal) =>
  api.get<DaySummary>(`/api/summary/day?date=${date}`, signal ? { signal } : {});
export const createEntry = (body: {
  date: string;
  meal: Entry['meal'];
  foodId: string;
  grams: number;
}) => api.post<Entry>('/api/entries', body);
export const updateEntry = (id: string, changes: EntryChanges) =>
  api.patch<Entry>(`/api/entries/${id}`, changes);
export const deleteEntry = (id: string) => api.delete<void>(`/api/entries/${id}`);
export function useDaySummary(date: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: summaryKey(date),
    queryFn: ({ signal }) => {
      const current = client.getQueryData<DaySummary>(summaryKey(date));
      if (diarySession(client).days.get(date)?.pending.length && current) return current;
      return getDaySummary(date, signal);
    },
  });
}
type PendingAction = { action: DiaryAction };
type DayMutations = { base: DaySummary | undefined; pending: PendingAction[] };
type DiarySession = {
  token: string | null;
  days: Map<string, DayMutations>;
  requests: Map<string, Promise<Entry | void>>;
};
// Shared by hook instances, isolated by query cache and authentication session.
const sessions = new WeakMap<QueryClient, DiarySession>();
function diarySession(client: QueryClient): DiarySession {
  const token = getToken();
  let session = sessions.get(client);
  if (!session || session.token !== token) {
    session = { token, days: new Map(), requests: new Map() };
    sessions.set(client, session);
  }
  return session;
}
export function useDiaryMutation() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationKey: ['diary'],
    networkMode: 'always',
    mutationFn: async (action: DiaryAction): Promise<Entry | void> => {
      if (action.kind === 'add')
        return createEntry({
          date: action.date,
          meal: action.meal,
          foodId: action.food.id!,
          grams: action.grams,
        });
      const requests = diarySession(client).requests;
      const id = action.entry.id;
      // A failed request releases the next action too.
      const request = (requests.get(id) ?? Promise.resolve())
        .catch(() => {})
        .then<Entry | void>(() =>
          action.kind === 'edit' ? updateEntry(id, action.changes) : deleteEntry(id),
        );
      requests.set(id, request);
      try {
        return await request;
      } finally {
        if (requests.get(id) === request) requests.delete(id);
      }
    },
    onMutate: async (action) => {
      const token = getToken();
      const date = action.kind === 'add' ? action.date : action.entry.date;
      const key = summaryKey(date);
      await client.cancelQueries({ queryKey: key });
      const session = diarySession(client);
      const pending = { action };
      if (session.token !== token) return { key, session, pending, date, token };
      let day = session.days.get(date);
      if (!day) {
        day = { base: client.getQueryData<DaySummary>(key), pending: [] };
        session.days.set(date, day);
      }
      day.pending.push(pending);
      if (day.base)
        client.setQueryData(
          key,
          applyPendingDiaryActions(
            day.base,
            day.pending.map((p) => p.action),
          ),
        );
      return { key, session, pending, date, token };
    },
    onSuccess: (entry, action, context) => {
      if (getToken() !== context.token || diarySession(client) !== context.session) return;
      const day = context.session.days.get(context.date);
      if (!day) return;
      day.pending = day.pending.filter((pending) => pending !== context.pending);
      if (day.base) {
        day.base = incorporateDiaryResult(day.base, action, entry);
        client.setQueryData(
          context.key,
          applyPendingDiaryActions(
            day.base,
            day.pending.map((p) => p.action),
          ),
        );
      }
      if (!day.pending.length) context.session.days.delete(context.date);
    },
    onError: (error, action, context) => {
      if (!context || getToken() !== context.token || diarySession(client) !== context.session)
        return;
      const day = context.session.days.get(context.date);
      if (!day) return;
      day.pending = day.pending.filter((pending) => pending !== context.pending);
      if (day.base)
        client.setQueryData(
          context.key,
          applyPendingDiaryActions(
            day.base,
            day.pending.map((p) => p.action),
          ),
        );
      if (!day.pending.length) context.session.days.delete(context.date);
      const message =
        action.kind === 'add'
          ? 'No se pudo agregar.'
          : action.kind === 'delete'
            ? 'No se pudo borrar.'
            : action.changes.status === 'eaten'
              ? 'No se pudo marcar como comido.'
              : 'No se pudieron guardar los cambios.';
      const detail =
        error instanceof ApiError && (error.code === 'network_error' || error.status === 0)
          ? 'Revisá tu conexión.'
          : error.message;
      toast(`${message} ${detail}`);
    },
    onSettled: async (_data, _error, _action, context) => {
      if (!context || getToken() !== context.token || diarySession(client) !== context.session)
        return;
      await Promise.all([
        ...(!context.session.days.has(context.date)
          ? [client.invalidateQueries({ queryKey: context.key })]
          : []),
        client.invalidateQueries({ queryKey: ['foods', 'recent'] }),
        client.invalidateQueries({ queryKey: ['foods', 'frequent'] }),
      ]);
    },
  });
}
