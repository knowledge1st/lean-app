// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ShoppingItem } from '@lean/shared';
import { ToastProvider } from '../components/ui/Toast';
import { jsonResponse } from '../auth/testUtils';
import { shoppingKey } from '../features/shopping/api';
import { Compras } from './Compras';
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../lib/api', async (original) => {
  const actual = await original<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
const week = '2026-W47';
const key = shoppingKey(week);
const storageKey = 'lean.shopping.v1';
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  localStorage.clear();
  vi.unstubAllGlobals();
});
function item(index: number, changes: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    foodId: null,
    label: `Alimento ${index}`,
    totalGrams: 850,
    checked: false,
    manual: false,
    ...changes,
  };
}
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(path = `/compras?semana=${week}`) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30000 }, mutations: { retry: false } },
  });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Compras />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, ...view };
}
function mockServer(initial: ShoppingItem[]) {
  let items = initial;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/generate')) return jsonResponse(items);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { label: string; quantity?: number };
      const saved = item(100, {
        label: body.label,
        totalGrams: body.quantity ?? null,
        manual: true,
      });
      items = [...items, saved];
      return jsonResponse(saved, 201);
    }
    if (init?.method === 'DELETE') {
      items = url.includes('/checked?')
        ? items.filter((entry) => !entry.checked)
        : items.filter((entry) => !url.endsWith(entry.id));
      return new Response(null, { status: 204 });
    }
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as {
        checked?: boolean;
        label?: string;
        quantity?: number | null;
      };
      const old = items.find((entry) => url.endsWith(entry.id))!;
      const saved = {
        ...old,
        ...body,
        totalGrams: body.quantity === undefined ? old.totalGrams : body.quantity,
      };
      items = items.map((entry) => (entry.id === old.id ? saved : entry));
      return jsonResponse(saved);
    }
    return jsonResponse(items);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetchMock,
    setItems: (next: ShoppingItem[]) => {
      items = next;
    },
  };
}
it('marca diez filas rápido, conserva optimismo durante refetch y acepta respuestas desordenadas', async () => {
  const initial = Array.from({ length: 10 }, (_, index) => item(index));
  let server = initial;
  const requests = initial.map(() => deferred());
  const stale = deferred();
  let reads = 0;
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    if (init?.method === 'PATCH')
      return requests[initial.findIndex((entry) => String(input).endsWith(entry.id))]!.promise;
    reads++;
    if (reads === 2) return stale.promise;
    return Promise.resolve(jsonResponse(server));
  });
  vi.stubGlobal('fetch', fetchMock);
  const { client, unmount } = setup();
  await screen.findByRole('checkbox', { name: 'Alimento 0' });
  let revalidation!: Promise<unknown>;
  act(() => {
    revalidation = client.refetchQueries({ queryKey: key });
  });
  await waitFor(() => expect(reads).toBe(2));
  for (const entry of initial) fireEvent.click(screen.getByRole('checkbox', { name: entry.label }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(10),
  );
  await act(async () => {
    stale.resolve(jsonResponse(initial));
    await revalidation;
  });
  await act(async () => {
    await client.refetchQueries({ queryKey: key });
  });
  expect(client.getQueryData<ShoppingItem[]>(key)!.every((entry) => entry.checked)).toBe(true);
  expect(
    (screen.getAllByRole('checkbox') as HTMLInputElement[]).every((checkbox) => checkbox.checked),
  ).toBe(true);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  for (const index of [9, 2, 7, 1, 5, 0, 8, 4, 6, 3]) {
    server = server.map((entry, position) =>
      position === index ? { ...entry, checked: true } : entry,
    );
    await act(async () => requests[index]!.resolve(jsonResponse(server[index])));
    if (index !== 3) expect(invalidate).not.toHaveBeenCalled();
  }
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(key)).toEqual(server);
  expect(
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'PATCH')
      .map(([, init]) => JSON.parse(String(init?.body))),
  ).toEqual(initial.map(() => ({ checked: true })));
  unmount();
  setup();
  expect(
    (screen.getAllByRole('checkbox') as HTMLInputElement[]).every((checkbox) => checkbox.checked),
  ).toBe(true);
  await screen.findByText('10 de 10');
});
it('serializa dos toques del mismo ítem: true y false', async () => {
  const original = item(1);
  const requests = [deferred(), deferred()];
  const bodies: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      if (init?.method === 'PATCH') {
        bodies.push(JSON.parse(String(init.body)));
        return requests[bodies.length - 1]!.promise;
      }
      return Promise.resolve(jsonResponse([original]));
    }),
  );
  const { client } = setup();
  const checkbox = await screen.findByRole('checkbox', { name: original.label });
  fireEvent.click(checkbox);
  fireEvent.click(checkbox);
  await waitFor(() => expect(bodies).toEqual([{ checked: true }]));
  await act(async () => requests[0]!.resolve(jsonResponse({ ...original, checked: true })));
  await waitFor(() => expect(bodies).toEqual([{ checked: true }, { checked: false }]));
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  await act(async () => requests[1]!.resolve(jsonResponse(original)));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(key)).toEqual([original]);
});
it('un error revierte solo ese ítem', async () => {
  const initial = [item(1), item(2)];
  const requests = [deferred(), deferred()];
  const server = [initial[0]!, { ...initial[1]!, checked: true }];
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((input, init) =>
        init?.method === 'PATCH'
          ? requests[String(input).endsWith(initial[0]!.id) ? 0 : 1]!.promise
          : Promise.resolve(jsonResponse(server)),
      ),
  );
  const { client } = setup();
  await screen.findByRole('checkbox', { name: initial[0]!.label });
  fireEvent.click(screen.getByRole('checkbox', { name: initial[0]!.label }));
  // Second item starts checked in this server snapshot; toggle it off and fail the first.
  fireEvent.click(screen.getByRole('checkbox', { name: initial[1]!.label }));
  await act(async () => requests[0]!.reject(new Error('offline')));
  await screen.findByText('No se pudo marcar. Revisá tu conexión.');
  expect(client.getQueryData<ShoppingItem[]>(key)!.map((entry) => entry.checked)).toEqual([
    false,
    false,
  ]);
  server[1] = { ...server[1]!, checked: false };
  await act(async () => requests[1]!.resolve(jsonResponse(server[1])));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(key)).toEqual(server);
});
it('muestra 7 de 12 y ordena los comprados al final, tachados', async () => {
  const items = Array.from({ length: 12 }, (_, index) => item(index, { checked: index < 7 }));
  mockServer(items);
  setup();
  await screen.findByText('7 de 12');
  const rows = within(screen.getByRole('list', { name: 'Lista de compras' })).getAllByRole(
    'listitem',
  );
  expect(within(rows[0]!).getByRole('checkbox').getAttribute('aria-label')).toBe('Alimento 7');
  expect(screen.getByText('Alimento 0').className).toContain('line-through');
});
it('confirma quitar comprados y conserva los pendientes', async () => {
  const items = [item(1), item(2, { checked: true })];
  const { fetchMock } = mockServer(items);
  const { client } = setup();
  await screen.findByText('1 de 2');
  fireEvent.click(screen.getByRole('button', { name: 'Quitar comprados' }));
  const dialog = screen.getByRole('dialog', { name: '¿Quitar 1 ítems comprados?' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Quitar comprados' }));
  await screen.findByText('0 de 1');
  expect(
    fetchMock.mock.calls.some(
      ([url, init]) =>
        String(url).endsWith(`/api/shopping/checked?week=${week}`) && init?.method === 'DELETE',
    ),
  ).toBe(true);
  expect(client.getQueryData(key)).toEqual([items[0]]);
});
it('regenera reemplazando con manuales y marcados de la respuesta', async () => {
  const { setItems } = mockServer([item(1)]);
  setup();
  await screen.findByText('0 de 1');
  setItems([
    item(2, { checked: true }),
    item(3, { manual: true, label: 'Servilletas', totalGrams: null }),
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar desde el plan' }));
  await screen.findByText('Lista actualizada');
  expect(screen.queryByRole('checkbox', { name: 'Alimento 1' })).toBeNull();
  expect((screen.getByRole('checkbox', { name: 'Alimento 2' }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect(screen.getByRole('checkbox', { name: 'Servilletas' })).toBeTruthy();
});
it('ofrece ambos caminos en vacío, enfoca alta y enlaza al plan sin comidas', async () => {
  mockServer([]);
  setup();
  await screen.findByText('Tu lista está vacía');
  fireEvent.click(screen.getByRole('button', { name: 'Agregar a mano' }));
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Agregar a mano' }));
  fireEvent.click(screen.getByRole('button', { name: 'Generar desde el plan' }));
  await screen.findByText('No hay comidas planificadas para esta semana');
  expect(screen.getByRole('link', { name: 'Ir a Plan' }).getAttribute('href')).toBe(
    `/plan?semana=${week}`,
  );
});
it('alta manual, edición y borrado de cantidad, y borrado de la fila', async () => {
  const { fetchMock } = mockServer([]);
  setup();
  await screen.findByText('Tu lista está vacía');
  const name = screen.getByRole('textbox', { name: 'Agregar a mano' });
  const grams = screen.getByRole('textbox', { name: 'Cantidad en gramos (opcional)' });
  fireEvent.change(name, { target: { value: ' Pan ' } });
  fireEvent.change(grams, { target: { value: '250,5' } });
  fireEvent.submit(name.closest('form')!);
  await screen.findByRole('checkbox', { name: 'Pan' });
  expect((name as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(name);
  expect(
    fetchMock.mock.calls.some(
      ([, init]) =>
        init?.method === 'POST' &&
        String(init.body) === JSON.stringify({ week, label: 'Pan', quantity: 250.5 }),
    ),
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Pan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), {
    target: { value: 'Pan integral' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cantidad en gramos (opcional)' }), {
    target: { value: '' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    fetchMock.mock.calls.some(
      ([, init]) =>
        init?.method === 'PATCH' &&
        String(init.body) === JSON.stringify({ label: 'Pan integral', quantity: null }),
    ),
  ).toBe(true);
  expect(screen.queryByText('250,5 g')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Pan integral' }));
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
  await screen.findByText('Tu lista está vacía');
});
it.each(['same', 'other', 'corrupt', 'invalid'])(
  'hidrata únicamente caché válida del usuario: %s',
  async (kind) => {
    const saved = item(1, { label: 'Guardado', checked: true });
    localStorage.setItem(
      storageKey,
      kind === 'corrupt'
        ? '{broken'
        : JSON.stringify({
            userId: kind === 'other' ? 'user-2' : 'user-1',
            weeks: {
              [week]: {
                items: kind === 'invalid' ? [{ wrong: true }] : [saved],
                savedAt: Date.now() - 60000,
              },
            },
          }),
    );
    const request = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));
    setup();
    if (kind === 'same')
      expect((screen.getByRole('checkbox', { name: 'Guardado' }) as HTMLInputElement).checked).toBe(
        true,
      );
    else expect(screen.queryByRole('checkbox')).toBeNull();
    await act(async () => request.resolve(jsonResponse([item(2)])));
    await screen.findByRole('checkbox', { name: 'Alimento 2' });
  },
);
it('guarda cambios optimistas y conserva como máximo cuatro semanas', async () => {
  const weeks = Object.fromEntries(
    ['2026-W40', '2026-W41', '2026-W42', '2026-W43'].map((value, index) => [
      value,
      { items: [], savedAt: index + 1 },
    ]),
  );
  localStorage.setItem(storageKey, JSON.stringify({ userId: 'user-1', weeks }));
  const request = deferred();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((_input, init) =>
        init?.method === 'PATCH' ? request.promise : Promise.resolve(jsonResponse([item(1)])),
      ),
  );
  setup();
  await screen.findByRole('checkbox');
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem(storageKey)!) as {
      weeks: Record<string, { items: ShoppingItem[] }>;
    };
    expect(Object.keys(saved.weeks)).toHaveLength(4);
    expect(saved.weeks['2026-W40']).toBeUndefined();
    expect(saved.weeks[week]!.items[0]!.checked).toBe(true);
  });
  await act(async () => request.resolve(jsonResponse({ ...item(1), checked: true })));
});
it('mantiene datos persistidos y avisa si falla revalidación', async () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({ userId: 'user-1', weeks: { [week]: { items: [item(1)], savedAt: 1 } } }),
  );
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  setup();
  await screen.findByText('No se pudo actualizar. Seguís viendo tu lista guardada.');
  expect(screen.getByRole('checkbox')).toBeTruthy();
});
it('espera un marcado pendiente antes de regenerar', async () => {
  const original = item(1);
  const patch = deferred();
  const generated = item(2, { checked: true });
  let server = [original];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    if (init?.method === 'PATCH') return patch.promise;
    if (String(input).includes('/generate')) return Promise.resolve(jsonResponse([generated]));
    return Promise.resolve(jsonResponse(server));
  });
  vi.stubGlobal('fetch', fetchMock);
  const { client } = setup();
  fireEvent.click(await screen.findByRole('checkbox'));
  await waitFor(() => expect(client.isMutating()).toBe(1));
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar desde el plan' }));
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/generate'))).toBe(false);
  server = [{ ...original, checked: true }];
  await act(async () => patch.resolve(jsonResponse(server[0])));
  await screen.findByRole('checkbox', { name: generated.label });
  expect(client.getQueryData(key)).toEqual([generated]);
});
it('alta optimista queda deshabilitada hasta recibir confirmación', async () => {
  const request = deferred();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((_input, init) =>
        init?.method === 'POST' ? request.promise : Promise.resolve(jsonResponse([])),
      ),
  );
  const { client } = setup();
  await screen.findByText('Tu lista está vacía');
  const input = screen.getByRole('textbox', { name: 'Agregar a mano' });
  fireEvent.change(input, { target: { value: 'Bolsas' } });
  fireEvent.submit(input.closest('form')!);
  const checkbox = await screen.findByRole('checkbox', { name: 'Bolsas' });
  expect((checkbox as HTMLInputElement).disabled).toBe(true);
  expect(client.getQueryData<ShoppingItem[]>(key)![0]!.id).toMatch(/^temp-/);
  const saved = item(10, { label: 'Bolsas', manual: true, totalGrams: null });
  // Hold the final GET so the confirmed row is observable.
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => {})));
  await act(async () => request.resolve(jsonResponse(saved, 201)));
  await waitFor(() =>
    expect((screen.getByRole('checkbox', { name: 'Bolsas' }) as HTMLInputElement).disabled).toBe(
      false,
    ),
  );
});
it('borrado optimista fallido restaura solo su fila', async () => {
  const items = [item(1), item(2)];
  const request = deferred();
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((_input, init) =>
        init?.method === 'DELETE' ? request.promise : Promise.resolve(jsonResponse(items)),
      ),
  );
  const { client } = setup();
  await screen.findByText('0 de 2');
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Alimento 1' }));
  expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
  await waitFor(() => expect(client.getQueryData<ShoppingItem[]>(key)).toEqual([items[1]]));
  await act(async () => request.reject(new Error('offline')));
  await screen.findByRole('checkbox', { name: 'Alimento 1' });
  expect(client.getQueryData(key)).toEqual(items);
});
it('edita nombre y cantidad de manual y avisa sin generados aunque haya manuales', async () => {
  mockServer([item(1, { manual: true })]);
  setup();
  await screen.findByRole('checkbox');
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar desde el plan' }));
  await screen.findByRole('link', { name: 'Ir a Plan' });
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de Alimento 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), {
    target: { value: 'Maní' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cantidad en gramos (opcional)' }), {
    target: { value: '1250' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('checkbox', { name: 'Maní' })).toBeTruthy();
  expect(screen.getByText('1,25 kg')).toBeTruthy();
});
it('navega semanas manteniendo el parámetro semana válido', async () => {
  const { fetchMock } = mockServer([]);
  setup();
  await screen.findByText('16 – 22 nov');
  fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
  await screen.findByText('23 – 29 nov');
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/shopping?week=2026-W48')),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
  await screen.findByText('16 – 22 nov');
});
it('muestra error sin datos y permite reintentar', async () => {
  const fetchMock = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(jsonResponse([]));
  vi.stubGlobal('fetch', fetchMock);
  setup();
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Tu lista está vacía');
});
