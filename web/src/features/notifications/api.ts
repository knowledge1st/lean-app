import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RemindersResponse, UpdateRemindersInput } from '@lean/shared';
import { api } from '../../lib/api';

export const remindersKey = ['reminders'] as const;
export const useReminders = () =>
  useQuery({
    queryKey: remindersKey,
    queryFn: () => api.get<RemindersResponse>('/api/reminders'),
  });
export function useSaveReminders() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateRemindersInput) =>
      api.put<RemindersResponse>('/api/reminders', input),
    onSuccess: (data) => client.setQueryData(remindersKey, data),
  });
}
export const sendTestPush = () =>
  api.post<{ sent: number; failed: number; removed: number }>('/api/push/test');
