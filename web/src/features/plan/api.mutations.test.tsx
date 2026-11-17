// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { api } from '../../lib/api';
import { useCopyEntries, useGenerateShopping, type CopyEntriesBody } from './api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const key of [
    ['summary', 'day', '2026-11-17'],
    ['summary', 'day', '2026-11-18'],
    ['summary', 'day', '2026-11-23'],
    ['summary', 'week', '2026-W47'],
    ['shopping', '2026-W47'],
    ['shopping', '2026-W48'],
  ])
    client.setQueryData(key, []);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
it.each([
  { scope: 'day', from: '2026-11-17', to: '2026-11-18', mode: 'replace' },
  { scope: 'meal', from: '2026-11-17', to: '2026-11-18', meal: 'lunch', status: 'planned' },
] satisfies CopyEntriesBody[])(
  'invalida solo el destino y las semanas al copiar $scope',
  async (body) => {
    vi.spyOn(api, 'post').mockResolvedValue([]);
    const { client, wrapper } = setup();
    const { result } = renderHook(useCopyEntries, { wrapper });
    await act(async () => {
      await result.current.mutateAsync(body);
    });
    expect(client.getQueryState(['summary', 'day', body.to])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['summary', 'day', body.from])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['summary', 'week', '2026-W47'])?.isInvalidated).toBe(true);
    client.clear();
  },
);
it('invalida el rango destino incluso cuando reemplazar devuelve cero entradas', async () => {
  vi.spyOn(api, 'post').mockResolvedValue([]);
  const { client, wrapper } = setup();
  const { result } = renderHook(useCopyEntries, { wrapper });
  await act(async () => {
    await result.current.mutateAsync({
      scope: 'week',
      from: '2026-W46',
      to: '2026-W47',
      mode: 'replace',
    });
  });
  expect(client.getQueryState(['summary', 'day', '2026-11-17'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['summary', 'day', '2026-11-18'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['summary', 'day', '2026-11-23'])?.isInvalidated).toBe(false);
  client.clear();
});
it.each([false, true])(
  'compras invalida únicamente su semana al éxito, fallo %s',
  async (failure) => {
    const post = vi.spyOn(api, 'post');
    if (failure) post.mockRejectedValue(new Error('offline'));
    else post.mockResolvedValue([]);
    const { client, wrapper } = setup();
    const { result } = renderHook(useGenerateShopping, { wrapper });
    await act(async () => {
      await result.current.mutateAsync('2026-W47').catch(() => {});
    });
    expect(client.getQueryState(['shopping', '2026-W47'])?.isInvalidated).toBe(!failure);
    expect(client.getQueryState(['shopping', '2026-W48'])?.isInvalidated).toBe(false);
    expect(client.getQueryState(['summary', 'week', '2026-W47'])?.isInvalidated).toBe(false);
    client.clear();
  },
);
it('no invalida al fallar la copia', async () => {
  vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
  const { client, wrapper } = setup();
  const { result } = renderHook(useCopyEntries, { wrapper });
  await act(async () => {
    await result.current
      .mutateAsync({ scope: 'day', from: '2026-11-17', to: '2026-11-18', mode: 'append' })
      .catch(() => {});
  });
  expect(
    client
      .getQueryCache()
      .getAll()
      .every((query) => !query.state.isInvalidated),
  ).toBe(true);
  client.clear();
});
