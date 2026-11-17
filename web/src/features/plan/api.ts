import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isoWeekRange, type CopyEntriesInput, type Entry, type ShoppingItem } from '@lean/shared';
import { addDays } from '../../lib/date';
import { shoppingKey } from '../shopping/api';
import { api } from '../../lib/api';

export type CopyEntriesBody = CopyEntriesInput;
export const copyEntries = (body: CopyEntriesBody) => api.post<Entry[]>('/api/entries/copy', body);
export const generateShopping = (week: string) =>
  api.post<ShoppingItem[]>('/api/shopping/generate', { week });

export function useCopyEntries() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: copyEntries,
    onSuccess: async (entries, body) => {
      const destinations =
        body.scope === 'week'
          ? Array.from({ length: 7 }, (_, index) => addDays(isoWeekRange(body.to).from, index))
          : [body.to];
      const dates = new Set([...destinations, ...entries.map((entry) => entry.date)]);
      await Promise.all([
        ...Array.from(dates, (date) =>
          client.invalidateQueries({ queryKey: ['summary', 'day', date], exact: true }),
        ),
        client.invalidateQueries({ queryKey: ['summary', 'week'] }),
      ]);
    },
  });
}
export function useGenerateShopping() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: generateShopping,
    onSuccess: (_items, week) =>
      client.invalidateQueries({ queryKey: shoppingKey(week), exact: true }),
  });
}
export function kcalStatus(
  totalKcal: number,
  targetKcal: number | null | undefined,
): 'on' | 'near' | 'off' | null {
  if (targetKcal == null || targetKcal <= 0) return null;
  const difference = Math.abs(totalKcal - targetKcal) / targetKcal;
  return difference <= 0.05 ? 'on' : difference <= 0.15 ? 'near' : 'off';
}
