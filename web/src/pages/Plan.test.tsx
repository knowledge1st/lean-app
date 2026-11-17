// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { jsonResponse } from '../auth/testUtils';
import { ToastProvider } from '../components/ui/Toast';
import { Plan } from './Plan';
vi.mock('../lib/api', async (original) => {
  const actual = await original<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
vi.mock('../lib/date', async (original) => ({
  ...(await original<typeof import('../lib/date')>()),
  todayLocal: () => '2026-11-16',
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const food = {
  id: 'food',
  source: 'seed' as const,
  createdByMe: false,
  name: 'Arroz',
  brand: null,
  barcode: null,
  servingG: null,
  servingLabel: null,
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
};
function summary(date: string, planned = false): DaySummary {
  const macros = { kcal: 200, protein: 10, carbs: 20, fat: 5 };
  const entry: Entry = {
    id: `entry-${date}`,
    date,
    meal: 'lunch',
    status: 'planned',
    foodId: 'food',
    food,
    grams: 100,
    ...macros,
    createdAt: `${date}T12:00:00Z`,
  };
  return {
    date,
    eaten: ZERO_MACROS,
    planned: planned ? macros : ZERO_MACROS,
    target: null,
    waterMl: 0,
    exerciseKcal: 0,
    meals: MEALS.map((meal) => ({
      meal,
      eaten: ZERO_MACROS,
      planned: planned && meal === 'lunch' ? macros : ZERO_MACROS,
      entries: planned && meal === 'lunch' ? [entry] : [],
    })),
  };
}
function Location() {
  const location = useLocation();
  return (
    <output aria-label="URL">
      {location.pathname}
      {location.search}
    </output>
  );
}
function setup(path = '/plan?semana=2026-W47&dia=2026-11-17') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Plan />
          <Location />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
function mockApi(
  plannedDates: string[] = [],
  post?: (url: string, body: Record<string, unknown>) => Promise<Response>,
) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = String(input);
    if (init?.method === 'POST')
      return post
        ? post(url, JSON.parse(String(init.body)) as Record<string, unknown>)
        : Promise.resolve(jsonResponse([]));
    if (url.includes('/foods/')) return Promise.resolve(jsonResponse([food]));
    const date = new URL(url).searchParams.get('date')!;
    return Promise.resolve(jsonResponse(summary(date, plannedDates.includes(date))));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
it('agrega planned en un día futuro y actualiza la tira optimista', async () => {
  let reject!: (error: Error) => void;
  const pending = new Promise<Response>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  const fetchMock = mockApi([], () => pending);
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Agregar a Almuerzo' }));
  fireEvent.click(await within(screen.getByRole('dialog')).findByText('Arroz'));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/api/entries') &&
          JSON.parse(String(init?.body)).status === 'planned',
      ),
    ).toBe(true),
  );
  const button = within(screen.getByRole('navigation', { name: /Días de la semana/ })).getByRole(
    'button',
    { name: /mar, 17 nov/ },
  );
  await waitFor(() => expect(within(button).getByText('200')).toBeTruthy());
  expect(client.getQueryData<DaySummary>(['summary', 'day', '2026-11-17'])!.planned.kcal).toBe(200);
  await act(async () => reject(new Error('offline')));
  client.clear();
});
it.each(['Agregar', 'Reemplazar'] as const)(
  'copia día consultando destino y permite %s',
  async (choice) => {
    const fetchMock = mockApi(['2026-11-18']);
    const client = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar este día a…' }));
    fireEvent.change(screen.getByLabelText('Día destino'), { target: { value: '2026-11-18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copiar día' }));
    fireEvent.click(await screen.findByRole('button', { name: choice }));
    await screen.findByText('Día copiado');
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/entries/copy'))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      scope: 'day',
      from: '2026-11-17',
      to: '2026-11-18',
      mode: choice === 'Agregar' ? 'append' : 'replace',
    });
    client.clear();
  },
);
it('copia la semana anterior con append si el destino está vacío', async () => {
  const fetchMock = mockApi();
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copiar la semana anterior' }));
  await screen.findByText('Semana copiada');
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/entries/copy'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    scope: 'week',
    from: '2026-W46',
    to: '2026-W47',
    mode: 'append',
  });
  client.clear();
});
it('genera compras para la semana visible y navega', async () => {
  const fetchMock = mockApi();
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Generar lista de compras' }));
  await waitFor(() =>
    expect(screen.getByLabelText('URL').textContent).toBe('/compras?semana=2026-W47'),
  );
  const call = fetchMock.mock.calls.find(([url]) =>
    String(url).endsWith('/api/shopping/generate'),
  )!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ week: '2026-W47' });
  client.clear();
});
it('marca lo planificado pasado como No cumplido', async () => {
  mockApi(['2026-11-15']);
  const client = setup('/plan?semana=2026-W46&dia=2026-11-15');
  expect(await screen.findByText(/No cumplido/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ya lo comí' })).toBeTruthy();
  client.clear();
});
it('normaliza parámetros inválidos y permite cambiar semana y día', async () => {
  mockApi();
  const client = setup('/plan?semana=2026-W99&dia=2026-02-30');
  await waitFor(() =>
    expect(screen.getByLabelText('URL').textContent).toBe('/plan?semana=2026-W47&dia=2026-11-16'),
  );
  fireEvent.click(screen.getByLabelText('Semana anterior'));
  expect(screen.getByLabelText('URL').textContent).toBe('/plan?semana=2026-W46&dia=2026-11-09');
  fireEvent.click(screen.getByLabelText('Semana siguiente'));
  expect(screen.getByLabelText('URL').textContent).toBe('/plan?semana=2026-W47&dia=2026-11-16');
  client.clear();
});

it('pide confirmación al vaciar y borra solamente entradas planned', async () => {
  const fetchMock = mockApi(['2026-11-17']);
  fetchMock.mockImplementation((input, init) => {
    if (init?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
    const date = new URL(String(input)).searchParams.get('date')!;
    const day = summary(date, date === '2026-11-17');
    if (date === '2026-11-17') {
      const entry = day.meals[1]!.entries[0]!;
      day.meals[1]!.entries.push({ ...entry, id: 'eaten-entry', status: 'eaten' });
    }
    return Promise.resolve(jsonResponse(day));
  });
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Vaciar lo planificado del día' }));
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }));
  await screen.findByText('Plan del día vaciado');
  const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
  expect(deletes).toHaveLength(1);
  expect(String(deletes[0]![0])).toContain('/api/entries/entry-2026-11-17');
  client.clear();
});
it('muestra skeleton y permite reintentar errores del día', async () => {
  const fetchMock = mockApi();
  fetchMock.mockImplementation(() => Promise.reject(new Error('offline')));
  const client = setup();
  expect(screen.getByLabelText('Cargando día')).toBeTruthy();
  await screen.findAllByRole('alert');
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  fetchMock.mockImplementation((input) => {
    const date = new URL(String(input)).searchParams.get('date')!;
    return Promise.resolve(jsonResponse(summary(date)));
  });
  const retryButtons = screen.getAllByRole('button', { name: 'Reintentar' });
  fireEvent.click(retryButtons[retryButtons.length - 1]!);
  expect(await screen.findByRole('button', { name: 'Agregar a Almuerzo' })).toBeTruthy();
  client.clear();
});

it('deshabilita copiar semana anterior en el límite inferior', async () => {
  const fetchMock = mockApi();
  const client = setup('/plan?semana=1900-W01');
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
  const button = screen.getByRole('button', {
    name: 'Copiar la semana anterior',
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  client.clear();
});
it.each(['Agregar', 'Reemplazar'] as const)(
  'copia desde el atajo de día y permite %s',
  async (choice) => {
    const fetchMock = mockApi(['2026-11-18']);
    const client = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copiar este día a…' }));
    const dialog = screen.getByRole('dialog');
    for (const label of ['lun 16', 'mié 18', 'jue 19', 'vie 20', 'sáb 21', 'dom 22']) {
      expect(within(dialog).getByRole('button', { name: label }).className).toContain('min-h-11');
    }
    expect(within(dialog).queryByRole('button', { name: 'mar 17' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'mié 18' }));
    fireEvent.click(await screen.findByRole('button', { name: choice }));
    await screen.findByText('Día copiado');
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/entries/copy'))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      scope: 'day',
      from: '2026-11-17',
      to: '2026-11-18',
      mode: choice === 'Agregar' ? 'append' : 'replace',
    });
    client.clear();
  },
);
it('copia directo desde un atajo a un día vacío', async () => {
  const fetchMock = mockApi();
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copiar este día a…' }));
  fireEvent.click(screen.getByRole('button', { name: 'dom 22' }));
  await screen.findByText('Día copiado');
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/entries/copy'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    scope: 'day',
    from: '2026-11-17',
    to: '2026-11-22',
    mode: 'append',
  });
  client.clear();
});

it('copia directo desde un atajo si el destino no tiene planificados', async () => {
  const fetchMock = mockApi();
  const client = setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Acciones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Copiar este día a…' }));
  fireEvent.click(screen.getByRole('button', { name: 'lun 16' }));
  await screen.findByText('Día copiado');
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/entries/copy'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({
    scope: 'day',
    from: '2026-11-17',
    to: '2026-11-16',
    mode: 'append',
  });
  client.clear();
});
