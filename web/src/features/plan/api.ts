import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Entry, ShoppingItem } from '@lean/shared';
import { api } from '../../lib/api';

export type CopyEntriesBody = {
  scope: 'day' | 'week';
  from: string;
  to: string;
  mode: 'append' | 'replace';
};
export const copyEntries = (body: CopyEntriesBody) => api.post<Entry[]>('/api/entries/copy', body);
export const generateShopping = (week: string) =>
  api.post<ShoppingItem[]>('/api/shopping/generate', { week });

function useInvalidateSummaries() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['summary', 'day'] }),
      client.invalidateQueries({ queryKey: ['summary', 'week'] }),
    ]);
}
export function useCopyEntries() {
  const invalidate = useInvalidateSummaries();
  return useMutation({ mutationFn: copyEntries, onSettled: invalidate });
}
export function useGenerateShopping() {
  const invalidate = useInvalidateSummaries();
  return useMutation({ mutationFn: generateShopping, onSettled: invalidate });
}
export function kcalStatus(
  totalKcal: number,
  targetKcal: number | null | undefined,
): 'on' | 'near' | 'off' | null {
  if (targetKcal == null || targetKcal <= 0) return null;
  const difference = Math.abs(totalKcal - targetKcal) / targetKcal;
  return difference <= 0.05 ? 'on' : difference <= 0.15 ? 'near' : 'off';
}
