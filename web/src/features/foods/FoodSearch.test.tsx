// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { jsonResponse } from '../../auth/testUtils';
import { FoodSearch } from './FoodSearch';
vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(['recent', 'frequent'] as const)(
  'muestra Skeleton al recargar %s con caché vacía',
  async (tab) => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        String(input).includes(`/foods/${tab}`) ? pending : Promise.resolve(jsonResponse([])),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['foods', tab], []);
    const { container } = render(
      <QueryClientProvider client={client}>
        <FoodSearch onSelect={vi.fn()} onCreate={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText('Buscar alimento'));
    if (tab === 'frequent') fireEvent.click(screen.getByRole('button', { name: 'Frecuentes' }));
    await waitFor(() => expect(client.isFetching({ queryKey: ['foods', tab] })).toBe(1));
    expect(screen.queryByText(/Todavía no hay alimentos/)).toBeNull();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    await act(async () => resolve(jsonResponse([])));
    expect(
      await screen.findByText(
        `Todavía no hay alimentos ${tab === 'recent' ? 'recientes' : 'frecuentes'}.`,
      ),
    ).toBeTruthy();
    client.clear();
  },
);
