// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { api } from '../../lib/api';
import { clearToken, setToken } from '../../lib/session';
import { ToastProvider } from '../../components/ui/Toast';
import { activeGoalKey } from '../goals/api';
import { bodyLogsKey, bodyRangeKey, useLogWeight } from './api';
import { log } from './testFixtures';
import type { ProgressLog } from './calc';

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  clearToken();
});
function deferred() {
  let resolve!: (value: ProgressLog) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ProgressLog>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const key = bodyRangeKey('2026-01-01', '2026-01-31');
function setup(logs: ProgressLog[] = []) {
  setToken('session-a');
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  clients.push(client);
  client.setQueryData(key, { logs });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(() => ({ first: useLogWeight(), second: useLogWeight() }), { wrapper });
  return { client, ...hook };
}
it.each([false, true])('el fallo restaura solo su fecha (fila previa: %s)', async (existing) => {
  const first = deferred();
  const second = deferred();
  const put = vi
    .spyOn(api, 'put')
    .mockImplementation((path) => (path.endsWith('01-01') ? first.promise : second.promise));
  const original = log('2026-01-01', 80);
  const { client, result } = setup(existing ? [original] : []);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  act(() => {
    result.current.first.mutate({ date: '2026-01-01', values: { weightKg: 79 } });
    result.current.second.mutate({ date: '2026-01-02', values: { weightKg: 78 } });
  });
  await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
  act(() => first.reject(new Error('offline')));
  await screen.findByText(/No se pudo guardar el registro/);
  expect(client.getQueryData(key)).toEqual({
    logs: [...(existing ? [original] : []), log('2026-01-02', 78, null)],
  });
  expect(invalidate).not.toHaveBeenCalled();
  act(() => second.resolve(log('2026-01-02', 78)));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(invalidate.mock.calls).toEqual([
    [{ queryKey: bodyLogsKey }],
    [{ queryKey: activeGoalKey }],
  ]);
});
it.each(['failure', 'success'])(
  'un cambio de token impide efectos al terminar: %s',
  async (outcome) => {
    const request = deferred();
    const put = vi.spyOn(api, 'put').mockReturnValue(request.promise);
    const { client, result } = setup([log('2026-01-01', 80)]);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => result.current.first.mutate({ date: '2026-01-01', values: { weightKg: 79 } }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    setToken('session-b');
    const newSession = { logs: [log('2026-01-01', 60)] };
    client.setQueryData(key, newSession);
    act(() => {
      if (outcome === 'failure') request.reject(new Error('offline'));
      else request.resolve(log('2026-01-01', 79));
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(client.getQueryData(key)).toEqual(newSession);
    expect(screen.queryByText(/No se pudo guardar el registro/)).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  },
);
it.each([
  { failFirst: true, failSecond: false },
  { failFirst: true, failSecond: true },
  { failFirst: false, failSecond: true },
  { failFirst: false, failSecond: false },
])(
  'guardados de la misma fecha: falla primero $failFirst, falla segundo $failSecond',
  async ({ failFirst, failSecond }) => {
    const first = deferred();
    const second = deferred();
    const put = vi
      .spyOn(api, 'put')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { client, result } = setup();
    const overlappingKey = bodyRangeKey('2025-12-01', '2026-02-01');
    const outsideKey = bodyRangeKey('2026-02-01', '2026-02-28');
    client.setQueryData(overlappingKey, { logs: [] });
    client.setQueryData(outsideKey, { logs: [] });
    act(() => result.current.first.mutate({ date: '2026-01-01', values: { weightKg: 80 } }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    act(() => result.current.second.mutate({ date: '2026-01-01', values: { weightKg: 79 } }));
    await waitFor(() =>
      expect(client.getQueryData(key)).toEqual({ logs: [log('2026-01-01', 79, null)] }),
    );
    expect(put).toHaveBeenCalledTimes(1);
    act(() => {
      if (failFirst) first.reject(new Error('offline'));
      else first.resolve(log('2026-01-01', 80));
    });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls.map(([path, values]) => [path, values])).toEqual([
      ['/api/body-logs/2026-01-01', { weightKg: 80 }],
      ['/api/body-logs/2026-01-01', { weightKg: 79 }],
    ]);
    expect(client.getQueryData(key)).toEqual({ logs: [log('2026-01-01', 79, null)] });
    expect(client.getQueryData(overlappingKey)).toEqual(client.getQueryData(key));
    act(() => {
      if (failSecond) second.reject(new Error('offline'));
      else second.resolve(log('2026-01-01', 79));
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    const expected = {
      logs: failSecond
        ? failFirst
          ? []
          : [log('2026-01-01', 80, null)]
        : [log('2026-01-01', 79, null)],
    };
    expect(client.getQueryData(key)).toEqual(expected);
    expect(client.getQueryData(overlappingKey)).toEqual(expected);
    expect(client.getQueryData(outsideKey)).toEqual({ logs: [] });
  },
);

it.each(['mutate', 'mutateAsync'] as const)(
  '%s captura la sesión antes de pausar y rechaza el PUT al cambiar de token',
  async (method) => {
    const put = vi.spyOn(api, 'put');
    const { client, result } = setup();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    onlineManager.setOnline(false);
    let completion: Promise<unknown> | undefined;
    act(() => {
      const variables = { date: '2026-01-01', values: { weightKg: 80 } };
      if (method === 'mutateAsync') {
        completion = result.current.first.mutateAsync(variables).catch((error: unknown) => error);
      } else {
        result.current.first.mutate(variables);
      }
    });
    await waitFor(() => expect(result.current.first.isPaused).toBe(true));
    await waitFor(() =>
      expect(client.getQueryData(key)).toEqual({ logs: [log('2026-01-01', 80, null)] }),
    );
    setToken('session-b');
    const newSession = { logs: [log('2026-01-01', 60)] };
    client.setQueryData(key, newSession);
    await act(async () => {
      onlineManager.setOnline(true);
      await client.resumePausedMutations();
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(result.current.first.error?.message).toBe('La sesión cambió.');
    if (completion) expect(await completion).toBeInstanceOf(Error);
    expect(put).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toEqual(newSession);
    expect(screen.queryByText(/No se pudo guardar el registro/)).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  },
);

it('conserva la tendencia confirmada y elimina el estado al terminar los pendientes', async () => {
  const first = deferred();
  const second = deferred();
  const put = vi
    .spyOn(api, 'put')
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const { client, result } = setup([log('2026-01-01', 81, 80.5)]);
  act(() => result.current.first.mutate({ date: '2026-01-01', values: { weightKg: 80 } }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  act(() => first.resolve(log('2026-01-01', 80)));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(key)).toEqual({ logs: [log('2026-01-01', 80, 80.5)] });
  const refreshed = { logs: [log('2026-01-01', 78, 79)] };
  client.setQueryData(key, refreshed);
  act(() => result.current.second.mutate({ date: '2026-01-01', values: { weightKg: 77 } }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
  expect(put).toHaveBeenLastCalledWith(
    '/api/body-logs/2026-01-01',
    { weightKg: 77 },
    { token: 'session-a' },
  );
  act(() => second.reject(new Error('offline')));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(key)).toEqual(refreshed);
});
