import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DaySummary, Entry } from '@lean/shared';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui/Toast';
import { applyDiaryAction, type DiaryAction, type EntryChanges } from './optimistic';
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
      const date = action.kind === 'add' ? action.date : action.entry.date;
      const key = summaryKey(date);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<DaySummary>(key);
      if (previous) client.setQueryData(key, applyDiaryAction(previous, action));
      return { key, previous };
    },
    onSuccess: (entry, action, context) => {
      if (action.kind === 'add' && entry)
        client.setQueryData<DaySummary>(
          context.key,
          (current) =>
            current && {
              ...current,
              meals: current.meals.map((meal) => ({
                ...meal,
                entries: meal.entries.map((item) =>
                  item.id === action.temporaryId ? entry : item,
                ),
              })),
            },
        );
    },
    onError: (error, _action, context) => {
      if (context?.previous) client.setQueryData(context.key, context.previous);
      toast(error.message || 'No se pudo guardar. Revisá tu conexión.');
    },
    onSettled: async (_data, _error, action, context) => {
      await Promise.all([
        client.invalidateQueries({
          queryKey:
            context?.key ?? summaryKey(action.kind === 'add' ? action.date : action.entry.date),
        }),
        client.invalidateQueries({ queryKey: ['foods', 'recent'] }),
        client.invalidateQueries({ queryKey: ['foods', 'frequent'] }),
      ]);
    },
  });
}
