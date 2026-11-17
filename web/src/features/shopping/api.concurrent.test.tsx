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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(shoppingKey(weekB), [item]);
  const hook = renderHook(
    () => ({
      list: useShoppingList(weekA),
      bulk: useShoppingBulk(weekA),
      patch: useShoppingMutation(weekB, 'toggle'),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { client, ...hook };
}

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
