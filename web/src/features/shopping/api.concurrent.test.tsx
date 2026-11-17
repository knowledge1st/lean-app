// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ShoppingItem } from '@lean/shared';
import { shoppingKey, useShoppingBulk, useShoppingList, useShoppingMutation } from './api';
import { api } from '../../lib/api';

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const weekA = '2026-W47';
const weekB = '2026-W48';
const item: ShoppingItem = {
  id: '00000000-0000-4000-8000-000000000001',
  foodId: null,
  label: 'Pan',
  totalGrams: 100,
  checked: false,
  manual: true,
};
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function setup(listWeek = weekA, items = [item]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(shoppingKey(weekB), items);
  const hook = renderHook(
    () => ({
      list: useShoppingList(listWeek),
      bulk: useShoppingBulk(listWeek),
      patch: useShoppingMutation(weekB, 'toggle'),
      add: useShoppingMutation(weekB, 'add'),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { client, ...hook };
}

it.each(['rechazados', 'exitosos'] as const)(
  'revalida una sola vez tras dos PATCH %s en el mismo turno',
  async (outcome) => {
    const items = [item, { ...item, id: '00000000-0000-4000-8000-000000000002' }];
    const requests = items.map(() => deferred<ShoppingItem>());
    const get = vi.spyOn(api, 'get').mockResolvedValue(items);
    const update = vi
      .spyOn(api, 'patch')
      .mockReturnValueOnce(requests[0]!.promise)
      .mockReturnValueOnce(requests[1]!.promise);
    const { client, result } = setup(weekB, items);
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    get.mockClear();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    act(() => {
      items.forEach(({ id }) =>
        result.current.patch.mutate({ kind: 'toggle', id, changes: { checked: true } }),
      );
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(client.getQueryData(shoppingKey(weekB))).toEqual(
      items.map((entry) => ({ ...entry, checked: true })),
    );
    const expected = items.map((entry) => ({ ...entry, checked: outcome === 'exitosos' }));
    get.mockResolvedValue(expected);
    await act(async () => {
      requests.forEach((request, index) => {
        if (outcome === 'rechazados') request.reject(new Error('offline'));
        else request.resolve(expected[index]!);
      });
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(client.getQueryData(shoppingKey(weekB))).toEqual(expected);
    expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: shoppingKey(weekB) });
    expect(get).toHaveBeenCalledExactlyOnceWith(`/api/shopping?week=${weekB}`, {
      signal: expect.any(AbortSignal),
    });
  },
);

it('espera al alta pendiente antes de revalidar la semana', async () => {
  const patch = deferred<ShoppingItem>();
  const add = deferred<ShoppingItem>();
  const added = { ...item, id: '00000000-0000-4000-8000-000000000002', label: 'Leche' };
  const get = vi.spyOn(api, 'get').mockResolvedValue([item]);
  const update = vi.spyOn(api, 'patch').mockReturnValue(patch.promise);
  const post = vi.spyOn(api, 'post').mockReturnValue(add.promise);
  const { client, result } = setup(weekB);
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  get.mockClear();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  act(() => {
    result.current.patch.mutate({ kind: 'toggle', id: item.id, changes: { checked: true } });
    result.current.add.mutate({ kind: 'add', item: added });
  });
  await waitFor(() => {
    expect(update).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });
  await act(async () => patch.resolve({ ...item, checked: true }));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  expect(invalidate).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  const expected = [{ ...item, checked: true }, added];
  get.mockResolvedValue(expected);
  await act(async () => add.resolve(added));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(shoppingKey(weekB))).toEqual(expected);
  expect(invalidate).toHaveBeenCalledExactlyOnceWith({ queryKey: shoppingKey(weekB) });
  expect(get).toHaveBeenCalledTimes(1);
});

it('omite la invalidación si una acción masiva de la misma semana sigue pendiente', async () => {
  const patch = deferred<ShoppingItem>();
  const generate = deferred<ShoppingItem[]>();
  const get = vi.spyOn(api, 'get').mockResolvedValue([item]);
  const update = vi.spyOn(api, 'patch').mockReturnValue(patch.promise);
  const post = vi.spyOn(api, 'post').mockReturnValue(generate.promise);
  const { client, result } = setup(weekB);
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  get.mockClear();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  act(() => {
    result.current.patch.mutate({ kind: 'toggle', id: item.id, changes: { checked: true } });
  });
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  act(() => result.current.bulk.mutate('generate'));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  await act(async () => patch.resolve({ ...item, checked: true }));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  expect(invalidate).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  const generated = [{ ...item, label: 'Lista generada' }];
  await act(async () => generate.resolve(generated));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(shoppingKey(weekB))).toEqual(generated);
  expect(invalidate).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
});

it('revalida A tras una regeneración fallida sin esperar al PATCH pendiente en B', async () => {
  const generate = deferred<ShoppingItem[]>();
  const patch = deferred<ShoppingItem>();
  const get = vi.spyOn(api, 'get').mockResolvedValue([item]);
  const post = vi.spyOn(api, 'post').mockReturnValue(generate.promise);
  const update = vi.spyOn(api, 'patch').mockReturnValue(patch.promise);
  const { client, result } = setup();
  await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
  let bulkResult!: Promise<unknown>;
  act(() => {
    bulkResult = result.current.bulk.run('generate').catch((error: unknown) => error);
  });
  await waitFor(() => expect(post).toHaveBeenCalled());
  act(() => {
    result.current.patch.mutate({ kind: 'toggle', id: item.id, changes: { checked: true } });
  });
  await waitFor(() => expect(update).toHaveBeenCalled());
  const refreshed = { ...item, label: 'Desde el servidor' };
  get.mockResolvedValue([refreshed]);
  const error = new Error('offline');
  await act(async () => {
    generate.reject(error);
    expect(await bulkResult).toBe(error);
  });
  await waitFor(() => expect(client.getQueryData(shoppingKey(weekA))).toEqual([refreshed]));
  expect(get).toHaveBeenCalledTimes(2);
  expect(get.mock.calls[1]![0]).toBe(`/api/shopping?week=${weekA}`);
  expect(client.isMutating({ mutationKey: shoppingKey(weekB) })).toBe(1);
  await act(async () => patch.resolve({ ...item, checked: true }));
  await waitFor(() => expect(client.isMutating()).toBe(0));
});

it.each(['generate', 'clear'] as const)(
  'inicia la acción masiva %s en A sin esperar al PATCH pendiente en B',
  async (kind) => {
    const patch = deferred<ShoppingItem>();
    vi.spyOn(api, 'get').mockResolvedValue([item]);
    const post = vi.spyOn(api, 'post').mockResolvedValue([item]);
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    const update = vi.spyOn(api, 'patch').mockReturnValue(patch.promise);
    const { client, result } = setup();
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    act(() => {
      result.current.patch.mutate({ kind: 'toggle', id: item.id, changes: { checked: true } });
    });
    await waitFor(() => expect(update).toHaveBeenCalled());
    let bulkResult!: Promise<ShoppingItem[]>;
    act(() => {
      bulkResult = result.current.bulk.run(kind);
    });
    await waitFor(() => {
      if (kind === 'generate')
        expect(post).toHaveBeenCalledWith('/api/shopping/generate', { week: weekA });
      else expect(remove).toHaveBeenCalledWith(`/api/shopping/checked?week=${weekA}`);
    });
    await act(async () => expect(await bulkResult).toEqual([item]));
    expect(client.isMutating({ mutationKey: shoppingKey(weekB) })).toBe(1);
    await act(async () => patch.resolve({ ...item, checked: true }));
    await waitFor(() => expect(client.isMutating()).toBe(0));
  },
);
