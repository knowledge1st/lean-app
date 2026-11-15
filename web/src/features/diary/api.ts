import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DaySummary, Entry } from '@lean/shared';
import { api } from '../../lib/api';
import { getToken } from '../../lib/session';
import { useToast } from '../../components/ui/Toast';
import {
  applyDiaryAction,
  recalculateSummary,
  revertDiaryAction,
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
  return useQuery({
    queryKey: summaryKey(date),
    queryFn: ({ signal }) => getDaySummary(date, signal),
  });
}
export function useDiaryMutation() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationKey: ['diary'],
    mutationFn: async (action: DiaryAction): Promise<Entry | void> =>
      action.kind === 'add'
        ? createEntry({
            date: action.date,
            meal: action.meal,
            foodId: action.food.id!,
            grams: action.grams,
          })
        : action.kind === 'edit'
          ? updateEntry(action.entry.id, action.changes)
          : deleteEntry(action.entry.id),
    onMutate: async (action) => {
      const token = getToken();
      const date = action.kind === 'add' ? action.date : action.entry.date;
      const key = summaryKey(date);
      await client.cancelQueries({ queryKey: key });
      if (getToken() === token)
        client.setQueryData<DaySummary>(key, (current) =>
          current ? applyDiaryAction(current, action) : undefined,
        );
      return { key, token };
    },
    onSuccess: (entry, action, context) => {
      if (getToken() !== context.token) return;
      if (action.kind === 'add' && entry)
        client.setQueryData<DaySummary>(context.key, (current) =>
          current
            ? recalculateSummary(
                current,
                current.meals.flatMap((meal) =>
                  meal.entries.map((item) => (item.id === action.temporaryId ? entry : item)),
                ),
              )
            : undefined,
        );
    },
    onError: (error, action, context) => {
      if (!context || getToken() !== context.token) return;
      client.setQueryData<DaySummary>(context.key, (current) =>
        current ? revertDiaryAction(current, action) : undefined,
      );
      toast(error.message || 'No se pudo guardar. Revisá tu conexión.');
    },
    onSettled: async (_data, _error, _action, context) => {
      if (!context || getToken() !== context.token) return;
      await Promise.all([
        ...(client.isMutating({ mutationKey: ['diary'] }) === 1
          ? [client.invalidateQueries({ queryKey: context.key })]
          : []),
        client.invalidateQueries({ queryKey: ['foods', 'recent'] }),
        client.invalidateQueries({ queryKey: ['foods', 'frequent'] }),
      ]);
    },
  });
}
