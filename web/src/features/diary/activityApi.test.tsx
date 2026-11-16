// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { api } from '../../lib/api';
import { useWater, useWaterMutation, useExercise, waterKey } from './activityApi';
import { clearToken, setToken } from '../../lib/session';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearToken();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
it('consulta agua y ejercicio para la fecha con cancelación', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ date: '2026-11-14', ml: 0, logs: [] });
  const { client, wrapper } = setup();
  const { result } = renderHook(
    () => ({ water: useWater('2026-11-14'), exercise: useExercise('2026-11-14') }),
    { wrapper },
  );
  await waitFor(() =>
    expect(result.current.water.isSuccess && result.current.exercise.isSuccess).toBe(true),
  );
  expect(get).toHaveBeenCalledWith('/api/water?date=2026-11-14', {
    signal: expect.any(AbortSignal),
  });
  expect(get).toHaveBeenCalledWith('/api/exercise?from=2026-11-14&to=2026-11-14', {
    signal: expect.any(AbortSignal),
  });
  client.clear();
});
it('confirma todas las sumas rápidas y permite varios deshacer en cola', async () => {
  let total = 0;
  const deltas: number[] = [];
  vi.spyOn(api, 'post').mockImplementation(async (_path, body) => {
    const { ml, date } = body as { ml: number; date: string };
    deltas.push(ml);
    total = Math.max(0, total + ml);
    return { date, ml: total } as never;
  });
  const { client, wrapper } = setup();
  const date = '2026-11-14';
  const { result } = renderHook(() => useWaterMutation(date), { wrapper });
  await act(async () => {
    const first = result.current(250);
    const second = result.current(500);
    const third = result.current(250);
    expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1000);
    await Promise.all([first, second, third]);
  });
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(1000);
  await act(async () => {
    await Promise.all([result.current(-250), result.current(-500), result.current(-250)]);
  });
  expect(deltas).toEqual([250, 500, 250, -250, -500, -250]);
  expect(total).toBe(0);
  client.clear();
});
it('no envía el deshacer de una suma que falló', async () => {
  const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
  const { client, wrapper } = setup();
  const date = '2026-11-14';
  const { result } = renderHook(() => useWaterMutation(date), { wrapper });
  await act(async () => {
    const addition = result.current(250);
    await Promise.all([addition, result.current(-250, addition)]);
  });
  expect(post).toHaveBeenCalledOnce();
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(0);
  client.clear();
});
it('ignora respuestas de agua de una sesión anterior', async () => {
  let resolve!: (value: unknown) => void;
  vi.spyOn(api, 'post').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }) as never,
  );
  setToken('first');
  const { client, wrapper } = setup();
  const date = '2026-11-14';
  const { result } = renderHook(() => useWaterMutation(date), { wrapper });
  let request!: Promise<boolean>;
  act(() => {
    request = result.current(250);
  });
  await waitFor(() => expect(api.post).toHaveBeenCalled());
  setToken('second');
  client.clear();
  client.setQueryData(waterKey(date), { date, ml: 900 });
  await act(async () => {
    resolve({ date, ml: 250 });
    await request;
  });
  expect(client.getQueryData<{ ml: number }>(waterKey(date))?.ml).toBe(900);
  client.clear();
});
