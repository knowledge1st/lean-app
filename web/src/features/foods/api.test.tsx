// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useCreateFood, useImportFood } from './api';
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});
it.each(['import', 'create'])('intenta %s sin conexión y devuelve network_error', async (kind) => {
  onlineManager.setOnline(false);
  const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => ({ create: useCreateFood(), import: useImportFood() }), {
    wrapper,
  });
  act(() => {
    if (kind === 'import') result.current.import.mutate('1234567890123');
    else result.current.create.mutate({ name: 'Pan', kcal: 100, protein: 0, carbs: 0, fat: 0 });
  });
  await waitFor(() =>
    expect(result.current[kind === 'import' ? 'import' : 'create'].error).toMatchObject({
      code: 'network_error',
    }),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  client.clear();
});
