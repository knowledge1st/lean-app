// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { activeGoalKey, profileKey, useCreateGoal, useSaveProfile } from './api';
import { api } from '../../lib/api';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(['profile', 'goal'])('mantiene coherente la caché al guardar %s', async (kind) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const initialKey = ['goals', 'wizard', 'initial'];
  client.setQueryData(initialKey, { profile: { heightCm: 165 }, goal: null });
  client.setQueryData(profileKey, { heightCm: 165 });
  client.setQueryData(['body-logs', '2026-11'], { logs: [] });
  client.setQueryData(activeGoalKey, null);
  vi.spyOn(api, 'get').mockResolvedValue({ id: 'new' });
  const profile = {
    sex: 'female' as const,
    birthDate: '1990-01-01',
    heightCm: 170,
    activityLevel: 'sedentary' as const,
    timeZone: 'UTC',
  };
  vi.spyOn(api, 'put').mockResolvedValue(profile);
  vi.spyOn(api, 'post').mockResolvedValue({ goal: { id: 'new' }, plan: {} });
  const { result } = renderHook(() => ({ save: useSaveProfile(), create: useCreateGoal() }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await act(async () => {
    if (kind === 'profile') await result.current.save.mutateAsync(profile);
    else
      await result.current.create.mutateAsync({
        weightKg: 70,
        goal: { mode: 'composition', preset: 'recomp' },
      });
  });
  expect(client.getQueryState(initialKey)?.isInvalidated).toBe(true);
  if (kind === 'profile') expect(client.getQueryState(activeGoalKey)?.isInvalidated).toBe(true);
  else expect(client.getQueryData(activeGoalKey)).toEqual({ id: 'new' });
  if (kind === 'profile') expect(client.getQueryData(profileKey)).toEqual(profile);
  else expect(client.getQueryState(profileKey)?.isInvalidated).toBe(true);
  expect(client.getQueryState(['body-logs', '2026-11'])?.isInvalidated).toBe(kind === 'goal');
  client.clear();
});
