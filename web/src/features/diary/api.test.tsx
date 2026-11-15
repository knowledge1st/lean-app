// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { jsonResponse } from '../../auth/testUtils';
import { clearToken, setToken } from '../../lib/session';
import { summaryKey, useDaySummary, useDiaryMutation } from './api';
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearToken();
});
const entry: Entry = {
  id: 'entry',
  date: '2026-11-14',
  meal: 'breakfast',
  status: 'eaten',
  foodId: 'food',
  grams: 100,
  kcal: 10,
  protein: 0,
  carbs: 0,
  fat: 0,
  food: {
    id: 'food',
    source: 'seed',
    name: 'Pan',
    brand: null,
    servingG: null,
    servingLabel: null,
  },
  createdAt: '2026-11-14T12:00:00Z',
};
function base(date = entry.date): DaySummary {
  const eaten = { ...ZERO_MACROS, kcal: 21 };
  return {
    date,
    target: null,
    eaten,
    planned: ZERO_MACROS,
    meals: MEALS.map((meal) => ({
      meal,
      eaten: meal === 'breakfast' ? eaten : ZERO_MACROS,
      planned: ZERO_MACROS,
      entries:
        meal === 'breakfast'
          ? [
              { ...entry, date },
              { ...entry, id: 'other', date },
            ]
          : [],
    })),
  };
}
function deferred() {
  let reject!: (error: Error) => void;
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, reject, resolve };
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}
it.each([false, true])(
  'restaura base exacta tras fallar gramos y comida (orden inverso: %s)',
  async (reverse) => {
    const requests = [deferred(), deferred()];
    let writes = 0;
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockImplementation((_input, init) =>
          init?.method === 'PATCH'
            ? requests[writes++]!.promise
            : Promise.reject(new Error('offline')),
        ),
    );
    const { client, wrapper } = setup();
    const original = base();
    client.setQueryData(summaryKey(entry.date), original);
    const { result } = renderHook(
      () => ({ first: useDiaryMutation(), second: useDiaryMutation() }),
      { wrapper },
    );
    act(() => result.current.first.mutate({ kind: 'edit', entry, changes: { grams: 200 } }));
    await waitFor(() => expect(writes).toBe(1));
    const edited = client.getQueryData<DaySummary>(summaryKey(entry.date))!.meals[0]!.entries[0]!;
    act(() =>
      result.current.second.mutate({ kind: 'edit', entry: edited, changes: { meal: 'dinner' } }),
    );
    await waitFor(() => expect(writes).toBe(2));
    const order = reverse ? [1, 0] : [0, 1];
    await act(async () => requests[order[0]!]!.reject(new Error('offline')));
    await waitFor(() => expect(client.isMutating()).toBe(1));
    await act(async () => requests[order[1]!]!.reject(new Error('offline')));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(client.getQueryData(summaryKey(entry.date))).toEqual(original);
    expect(client.getQueryData<DaySummary>(summaryKey(entry.date))!.eaten.kcal).toBe(21);
    client.clear();
  },
);
it('recarga cada fecha al terminar su última acción aunque otra fecha siga pendiente', async () => {
  const dates = [entry.date, '2026-11-15'];
  const requests = [deferred(), deferred()];
  const reads = [0, 0];
  let writes = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((input, init) => {
      if (init?.method === 'PATCH') return requests[writes++]!.promise;
      const index = String(input).includes(dates[0]!) ? 0 : 1;
      reads[index]!++;
      return Promise.resolve(jsonResponse(base(dates[index])));
    }),
  );
  const { client, wrapper } = setup();
  const { result } = renderHook(
    () => {
      useDaySummary(dates[0]!);
      useDaySummary(dates[1]!);
      return useDiaryMutation();
    },
    { wrapper },
  );
  await waitFor(() => expect(reads).toEqual([1, 1]));
  for (const date of dates) {
    act(() =>
      result.current.mutate({ kind: 'edit', entry: { ...entry, date }, changes: { grams: 200 } }),
    );
  }
  await waitFor(() => expect(writes).toBe(2));
  await act(async () => requests[0]!.resolve(jsonResponse({ ...entry, grams: 200 })));
  await waitFor(() => expect(reads).toEqual([2, 1]));
  await act(async () => requests[1]!.reject(new Error('offline')));
  await waitFor(() => expect(reads).toEqual([2, 2]));
  client.clear();
});
it('descarta pendientes al cambiar el token y permite nuevas acciones en la misma fecha', async () => {
  setToken('old');
  const requests = [deferred(), deferred()];
  let writes = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(() => requests[writes++]!.promise),
  );
  const { client, wrapper } = setup();
  client.setQueryData(summaryKey(entry.date), base());
  const { result } = renderHook(() => useDiaryMutation(), { wrapper });
  act(() => result.current.mutate({ kind: 'edit', entry, changes: { grams: 200 } }));
  await waitFor(() => expect(writes).toBe(1));
  setToken('new');
  const newBase = { ...base(), eaten: { ...ZERO_MACROS, kcal: 22 } };
  client.setQueryData(summaryKey(entry.date), newBase);
  act(() => result.current.mutate({ kind: 'delete', entry }));
  await waitFor(() => expect(writes).toBe(2));
  await act(async () => requests[0]!.reject(new Error('offline')));
  await act(async () => requests[1]!.reject(new Error('offline')));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(summaryKey(entry.date))).toEqual(newBase);
  client.clear();
});
