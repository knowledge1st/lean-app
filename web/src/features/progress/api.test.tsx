// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
it.each([false, true])(
  'serializa PUT de una misma fecha entre hooks, incluso tras fallo: %s',
  async (fail) => {
    const first = deferred();
    const second = deferred();
    const put = vi
      .spyOn(api, 'put')
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { client, result } = setup();
    act(() => result.current.first.mutate({ date: '2026-01-01', values: { weightKg: 80 } }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    act(() => result.current.second.mutate({ date: '2026-01-01', values: { weightKg: 79 } }));
    await waitFor(() =>
      expect(client.getQueryData(key)).toEqual({ logs: [log('2026-01-01', 79, null)] }),
    );
    expect(put).toHaveBeenCalledTimes(1);
    act(() => {
      if (fail) first.reject(new Error('offline'));
      else first.resolve(log('2026-01-01', 80));
    });
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2));
    expect(put.mock.calls.map(([path, values]) => [path, values])).toEqual([
      ['/api/body-logs/2026-01-01', { weightKg: 80 }],
      ['/api/body-logs/2026-01-01', { weightKg: 79 }],
    ]);
    act(() => second.resolve(log('2026-01-01', 79)));
    await waitFor(() => expect(client.isMutating()).toBe(0));
  },
);
