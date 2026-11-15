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

it.each(['recent', 'frequent', 'search'] as const)(
  'conserva datos de %s tras error de recarga y permite reintentar',
  async (tab) => {
    const food = { id: 'food', name: 'Pan', kcal: 100, source: 'seed' };
    const data = tab === 'search' ? { items: [food] } : [food];
    const key = tab === 'search' ? ['foods', 'search', 'pan'] : ['foods', tab];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        String(input).includes(`/foods/${tab}`)
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(jsonResponse([])),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(key, data);
    render(
      <QueryClientProvider client={client}>
        <FoodSearch onSelect={vi.fn()} onCreate={vi.fn()} />
      </QueryClientProvider>,
    );
    if (tab === 'frequent') fireEvent.click(screen.getByRole('button', { name: 'Frecuentes' }));
    if (tab === 'search')
      fireEvent.change(screen.getByLabelText('Buscar alimento'), { target: { value: 'pan' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Pan')).toBeTruthy();
    fetchMock.mockResolvedValue(jsonResponse(data));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('Pan')).toBeTruthy();
    client.clear();
  },
);
it('muestra error completo sin datos', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FoodSearch onSelect={vi.fn()} onCreate={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeTruthy();
  expect(screen.queryByText(/Todavía no hay/)).toBeNull();
  client.clear();
});
