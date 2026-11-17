import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ProfileInput,
  ProfileResponse,
  CreateGoalInput,
  ActiveGoal,
  PlanResponse,
  WeekSummary,
} from '@lean/shared';
import { api, ApiError } from '../../lib/api';

export const profileKey = ['profile'] as const;
export const activeGoalKey = ['goals', 'active'] as const;
export const weekSummaryKey = (week: string) => ['summary', 'week', week] as const;
async function nullable<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export const getProfile = () => nullable(api.get<ProfileResponse>('/api/profile'));
export const useProfile = () => useQuery({ queryKey: profileKey, queryFn: getProfile });
export const saveProfile = (input: ProfileInput) => api.put<ProfileResponse>('/api/profile', input);
export function useSaveProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveProfile,
    onSuccess: async (profile) => {
      client.setQueryData(profileKey, profile);
      await Promise.all([
        client.invalidateQueries({ queryKey: activeGoalKey }),
        client.invalidateQueries({ queryKey: ['goals', 'wizard', 'initial'] }),
      ]);
    },
  });
}
export const previewGoal = (body: CreateGoalInput) =>
  api.post<PlanResponse>('/api/goals/preview', body);
export const createGoal = (body: CreateGoalInput) =>
  api.post<{ goal: ActiveGoal; plan: PlanResponse }>('/api/goals', body);
export const getActiveGoal = () => nullable(api.get<ActiveGoal>('/api/goals/active'));
export const useActiveGoal = () => useQuery({ queryKey: activeGoalKey, queryFn: getActiveGoal });
export const getWeekSummary = (week: string) =>
  api.get<WeekSummary>(`/api/summary/week?week=${encodeURIComponent(week)}`);
export const useWeekSummary = (week: string) =>
  useQuery({ queryKey: weekSummaryKey(week), queryFn: () => getWeekSummary(week) });
export function useCreateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createGoal,
    onSuccess: async ({ goal }) => {
      client.setQueryData(activeGoalKey, goal);
      await Promise.all(
        [profileKey, ['goals', 'wizard', 'initial'], ['summary'], ['targets'], ['body-logs']].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
