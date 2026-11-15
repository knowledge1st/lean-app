// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, screen, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { jsonResponse } from '../../auth/testUtils';
import { clearToken, setToken } from '../../lib/session';
import { summaryKey, useDaySummary, useDiaryMutation } from './api';
import { incorporateDiaryResult, type DiaryAction } from './optimistic';
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearToken();
  onlineManager.setOnline(true);
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
it('restaura base exacta tras fallar gramos y comida en cola', async () => {
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
  const { result } = renderHook(() => ({ first: useDiaryMutation(), second: useDiaryMutation() }), {
    wrapper,
  });
  act(() => result.current.first.mutate({ kind: 'edit', entry, changes: { grams: 200 } }));
  await waitFor(() => expect(writes).toBe(1));
  const edited = client.getQueryData<DaySummary>(summaryKey(entry.date))!.meals[0]!.entries[0]!;
  act(() =>
    result.current.second.mutate({ kind: 'edit', entry: edited, changes: { meal: 'dinner' } }),
  );
  await waitFor(() =>
    expect(client.getQueryData<DaySummary>(summaryKey(entry.date))!.meals[3]!.entries).toHaveLength(
      1,
    ),
  );
  expect(writes).toBe(1);
  await act(async () => requests[0]!.reject(new Error('offline')));
  await waitFor(() => expect(writes).toBe(2));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  await act(async () => requests[1]!.reject(new Error('offline')));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(summaryKey(entry.date))).toEqual(original);
  expect(client.getQueryData<DaySummary>(summaryKey(entry.date))!.eaten.kcal).toBe(21);
  client.clear();
});
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
      result.current.mutate({
        kind: 'edit',
        entry: { ...entry, id: date === entry.date ? entry.id : 'other', date },
        changes: { grams: 200 },
      }),
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

it.each(['success', 'error'])(
  'serializa ediciones de la misma entrada tras %s',
  async (outcome) => {
    const requests = [deferred(), deferred()];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      const grams = JSON.parse(String(init?.body)).grams;
      return requests[grams === 200 ? 0 : 1]!.promise;
    });
    vi.stubGlobal('fetch', fetchMock);
    const { client, wrapper } = setup();
    client.setQueryData(summaryKey(entry.date), base());
    const { result } = renderHook(
      () => ({ first: useDiaryMutation(), second: useDiaryMutation() }),
      { wrapper },
    );
    act(() => result.current.first.mutate({ kind: 'edit', entry, changes: { grams: 200 } }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.second.mutate({ kind: 'edit', entry, changes: { grams: 300 } }));
    const currentEntry = () =>
      client.getQueryData<DaySummary>(summaryKey(entry.date))!.meals[0]!.entries[0]!;
    await waitFor(() => expect(currentEntry().grams).toBe(300));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (outcome === 'success')
        requests[0]!.resolve(jsonResponse({ ...entry, grams: 200, kcal: 20 }));
      else requests[0]!.reject(new Error('offline'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(currentEntry().grams).toBe(300);
    await act(async () => requests[1]!.resolve(jsonResponse({ ...entry, grams: 300, kcal: 30 })));
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(currentEntry().grams).toBe(300);
    expect(currentEntry().kcal).toBe(30);
    client.clear();
  },
);
it.each(['success', 'error'])(
  'conserva pendientes durante una recarga y recarga tras %s',
  async (outcome) => {
    const request = deferred();
    let reads = 0;
    let server = base();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation((_input, init) => {
        if (init?.method === 'PATCH') return request.promise;
        reads++;
        return Promise.resolve(jsonResponse(server));
      }),
    );
    const { client, wrapper } = setup();
    const { result } = renderHook(
      () => ({ summary: useDaySummary(entry.date), mutation: useDiaryMutation() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.summary.data).toBeDefined());
    act(() => result.current.mutation.mutate({ kind: 'edit', entry, changes: { grams: 200 } }));
    await waitFor(() => expect(result.current.summary.data!.meals[0]!.entries[0]!.grams).toBe(200));
    await act(async () => {
      await result.current.summary.refetch();
    });
    expect(reads).toBe(1);
    expect(result.current.summary.data!.meals[0]!.entries[0]!.grams).toBe(200);
    await act(async () => {
      if (outcome === 'success') {
        const saved = { ...entry, grams: 200, kcal: 20 };
        server = incorporateDiaryResult(
          base(),
          { kind: 'edit', entry, changes: { grams: 200 } },
          saved,
        );
        request.resolve(jsonResponse(saved));
      } else request.reject(new Error('offline'));
    });
    await waitFor(() => expect(reads).toBe(2));
    expect(result.current.summary.data).toEqual(server);
    client.clear();
  },
);
const actions = [
  {
    action: {
      kind: 'add',
      food: { ...entry.food, barcode: null, kcal: 10, protein: 0, carbs: 0, fat: 0 },
      grams: 100,
      meal: entry.meal,
      date: entry.date,
      temporaryId: 'temp',
    },
    message: 'No se pudo agregar.',
  },
  {
    action: { kind: 'edit', entry, changes: { grams: 200 } },
    message: 'No se pudieron guardar los cambios.',
  },
  {
    action: { kind: 'edit', entry: { ...entry, status: 'planned' }, changes: { status: 'eaten' } },
    message: 'No se pudo marcar como comido.',
  },
  { action: { kind: 'delete', entry }, message: 'No se pudo borrar.' },
] satisfies { action: DiaryAction; message: string }[];
it.each(actions)('revierte offline y avisa $message', async ({ action, message }) => {
  onlineManager.setOnline(false);
  const request = deferred();
  const fetchMock = vi.fn<typeof fetch>().mockReturnValue(request.promise);
  vi.stubGlobal('fetch', fetchMock);
  const { client, wrapper } = setup();
  const original = base();
  client.setQueryData(summaryKey(entry.date), original);
  const { result } = renderHook(() => useDiaryMutation(), { wrapper });
  act(() => result.current.mutate(action));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(client.getQueryData(summaryKey(entry.date))).not.toEqual(original);
  await act(async () => request.reject(new Error('offline')));
  expect(await screen.findByText(`${message} Revisá tu conexión.`)).toBeTruthy();
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(summaryKey(entry.date))).toEqual(original);
  client.clear();
});
it.each(actions)('incluye el mensaje de la API tras $message', async ({ action, message }) => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { code: 'invalid', message: 'Detalle de la API.' } }, 400),
      ),
  );
  const { client, wrapper } = setup();
  client.setQueryData(summaryKey(entry.date), base());
  const { result } = renderHook(() => useDiaryMutation(), { wrapper });
  act(() => result.current.mutate(action));
  expect(await screen.findByText(`${message} Detalle de la API.`)).toBeTruthy();
  client.clear();
});

it.each(['success', 'error'])(
  'envía entradas distintas en paralelo y admite confirmación inversa tras %s',
  async (outcome) => {
    const requests = [deferred(), deferred()];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => requests[String(input).endsWith('/other') ? 1 : 0]!.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { client, wrapper } = setup();
    client.setQueryData(summaryKey(entry.date), base());
    const { result } = renderHook(() => useDiaryMutation(), { wrapper });
    act(() => {
      result.current.mutate({ kind: 'edit', entry, changes: { grams: 200 } });
      result.current.mutate({
        kind: 'edit',
        entry: { ...entry, id: 'other' },
        changes: { grams: 300 },
      });
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const other = { ...entry, id: 'other', grams: 300, kcal: 30 };
    await act(async () => requests[1]!.resolve(jsonResponse(other)));
    await waitFor(() => expect(client.isMutating()).toBe(1));
    expect(
      client
        .getQueryData<DaySummary>(summaryKey(entry.date))!
        .meals[0]!.entries.map((item) => item.grams),
    ).toEqual([200, 300]);
    await act(async () => {
      if (outcome === 'success')
        requests[0]!.resolve(jsonResponse({ ...entry, grams: 200, kcal: 20 }));
      else requests[0]!.reject(new Error('offline'));
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(client.getQueryData<DaySummary>(summaryKey(entry.date))!.meals[0]!.entries).toEqual([
      outcome === 'success' ? { ...entry, grams: 200, kcal: 20 } : entry,
      other,
    ]);
    client.clear();
  },
);
