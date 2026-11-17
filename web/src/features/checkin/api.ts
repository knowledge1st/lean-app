import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Checkin } from '@lean/shared';
import { api, ApiError } from '../../lib/api';
import { activeGoalKey } from '../goals/api';

export const pendingCheckinKey = ['checkins', 'pending'] as const;
export const checkinsKey = (limit: number) => ['checkins', 'list', limit] as const;
type PendingCheckin = { checkin: Checkin | null };
export const usePendingCheckin = () =>
  useQuery({
    queryKey: pendingCheckinKey,
    queryFn: () => api.get<PendingCheckin>('/api/checkins/pending'),
    retry: false,
    throwOnError: false,
  });
export const useCheckins = (limit = 10) =>
  useQuery({
    queryKey: checkinsKey(limit),
    queryFn: () => api.get<{ checkins: Checkin[] }>(`/api/checkins?limit=${limit}`),
  });
export function useResolveCheckin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ checkin, accept }: { checkin: Checkin; accept: boolean }) => {
      try {
        return await api.post<Checkin>(`/api/checkins/${checkin.id}/resolve`, { accept });
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 409 &&
          error.code === 'checkin_already_resolved'
        )
          return null;
        throw error;
      }
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: pendingCheckinKey });
      const previous = client.getQueryData<PendingCheckin>(pendingCheckinKey);
      client.setQueryData(pendingCheckinKey, { checkin: null });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(pendingCheckinKey, context.previous);
    },
    onSuccess: async (result, { checkin, accept }) => {
      const keys: readonly unknown[][] =
        result === null || (accept && checkin.status === 'adjust')
          ? [['checkins'], ['summary'], ['targets'], [...activeGoalKey]]
          : [['checkins']];
      await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
    },
  });
}
