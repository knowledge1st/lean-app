// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Food, ParseMealTextResponse, ProposedItem } from '@lean/shared';
import { ToastProvider } from '../../components/ui/Toast';
import { addDays, todayLocal } from '../../lib/date';
import { TextLogSheet } from './TextLogSheet';
vi.hoisted(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');
});
const food: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Arroz',
  source: 'seed',
  createdByMe: false,
  brand: null,
  barcode: null,
  kcal: 100,
  protein: 5,
  carbs: 10,
  fat: 2,
  servingG: null,
  servingLabel: null,
};
function item(
  key: string,
  meal: ProposedItem['meal'],
  grams: number,
  match: ProposedItem['match'] = 'exact',
): ProposedItem {
  return {
    key,
    meal,
    grams,
    match,
    mealSource: 'text',
    said: key,
    gramsEstimated: true,
    food: match === 'none' ? null : { ...food, name: key },
    alternatives: [{ ...food, name: 'Alternativa', kcal: 200 }],
    searchQuery: key,
  };
}
const response: ParseMealTextResponse = {
  interpreter: 'rules',
  remainingToday: 7,
  warnings: ['Interpretación simple: revisá con más cuidado.'],
  items: [
    item('arroz', 'dinner', 100),
    item('pan', 'breakfast', 50, 'approximate'),
    item('medialuna', 'lunch', 30, 'none'),
    item('queso', 'snack', 25),
  ],
};
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function mockFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/parse-text')) return json(response);
    if (url.endsWith('/batch')) return json([{ id: 'created-1' }, { id: 'created-2' }], 201);
    if (init?.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/foods/search')) return json({ items: [food], offAvailable: true });
    throw new Error(`Unexpected request ${url}`);
  });
}
function setup(date = todayLocal(), textLogAi = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const onClose = vi.fn();
  const rendered = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <TextLogSheet date={date} defaultMeal="dinner" textLogAi={textLogAi} onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...rendered, client, onClose };
}
async function interpret() {
  fireEvent.change(screen.getByLabelText('¿Qué comiste?'), {
    target: { value: 'arroz, pan y medialuna' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
  await screen.findByRole('heading', { name: 'Revisá los alimentos' });
}
it('limits text to 1000 characters, counts it and conditionally explains AI privacy', () => {
  setup(todayLocal(), false);
  const input = screen.getByLabelText('¿Qué comiste?') as HTMLTextAreaElement;
  expect(document.activeElement).toBe(input);
  expect(input.maxLength).toBe(1000);
  expect(screen.getByRole('button', { name: 'Interpretar' }).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByText(/El texto se envía/)).toBeNull();
  fireEvent.change(input, { target: { value: 'a'.repeat(1001) } });
  expect(input.value).toHaveLength(1000);
  expect(screen.getByText('1000/1000')).toBeTruthy();
});
it.each([422, 429, 503, 400])(
  'keeps text and displays the server message on %i',
  async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json(
        { error: { code: 'text_not_understood', message: 'Revisá el texto y probá de nuevo.' } },
        status,
      ),
    );
    setup();
    expect(screen.getByText(/El texto se envía/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('¿Qué comiste?'), {
      target: { value: 'texto original' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Revisá el texto y probá de nuevo.',
    );
    expect(screen.getByLabelText('¿Qué comiste?')).toHaveProperty('value', 'texto original');
  },
);
it.each(['Cancelar', 'Cerrar', 'unmount'])(
  'aborts on %s and ignores late responses',
  async (action) => {
    let resolve!: (value: Response) => void;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { unmount, onClose } = setup();
    fireEvent.change(screen.getByLabelText('¿Qué comiste?'), { target: { value: 'arroz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
    await screen.findByRole('button', { name: 'Cancelar' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    if (action === 'unmount') unmount();
    else fireEvent.click(screen.getByRole('button', { name: action }));
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(json(response)));
    expect(screen.queryByRole('heading', { name: 'Revisá los alimentos' })).toBeNull();
    if (action === 'Cerrar') expect(onClose).toHaveBeenCalledOnce();
  },
);
it('groups meals in order, includes approximate matches, and displays warnings and quota', async () => {
  const fetchMock = mockFetch();
  setup();
  await interpret();
  expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
    'Desayuno',
    'Almuerzo',
    'Cena',
    'Snack',
  ]);
  expect(screen.getByRole('checkbox', { name: 'Incluir pan' })).toHaveProperty('checked', true);
  expect(screen.getByRole('checkbox', { name: 'Incluir medialuna' })).toHaveProperty(
    'checked',
    false,
  );
  expect(screen.getByRole('button', { name: '≈ pan' })).toBeTruthy();
  expect(screen.getByText('Interpretación simple: revisá con más cuidado.')).toBeTruthy();
  expect(screen.getByText('Te quedan 7 interpretaciones hoy')).toBeTruthy();
  expect(screen.getByText('Total: 175 kcal')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Guardar 3 alimentos' }).hasAttribute('disabled')).toBe(
    false,
  );
  expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
    date: todayLocal(),
    defaultMeal: 'dinner',
    text: 'arroz, pan y medialuna',
  });
});
it('updates totals on decimal grams, exclusion, meal changes, removal and food changes', async () => {
  mockFetch();
  setup();
  await interpret();
  fireEvent.change(screen.getByLabelText('Gramos de arroz'), { target: { value: '50,5' } });
  expect(screen.getByText('Total: 125,5 kcal')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir pan' }));
  expect(screen.getByText('Total: 75,5 kcal')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Comida de arroz'), { target: { value: 'breakfast' } });
  expect(
    within(screen.getByRole('region', { name: 'Desayuno' })).getByLabelText('Gramos de arroz'),
  ).toBeTruthy();
  expect(screen.getByText('Total: 75,5 kcal')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Quitar queso' }));
  expect(screen.getByText('Total: 50,5 kcal')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'arroz' }));
  expect(screen.getByLabelText('Buscar alimento')).toHaveProperty('value', 'arroz');
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Alternativas' })).getByRole('button', {
      name: 'Alternativa',
    }),
  );
  expect(screen.getByText('Total: 101 kcal')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Gramos de arroz'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Guardar 1 alimentos' }).hasAttribute('disabled')).toBe(
    true,
  );
});
it('keeps focus on the relocated meal selector across existing and newly created groups', async () => {
  mockFetch();
  setup();
  await interpret();
  for (const [meal, label] of [
    ['breakfast', 'Desayuno'],
    ['dinner', 'Cena'],
    ['snack', 'Snack'],
  ] as const) {
    const selector = screen.getByLabelText('Comida de arroz');
    selector.focus();
    fireEvent.change(selector, { target: { value: meal } });
    const relocated = within(screen.getByRole('region', { name: label })).getByLabelText(
      'Comida de arroz',
    );
    expect(relocated).not.toBe(selector);
    await waitFor(() => expect(document.activeElement).toBe(relocated));
  }
});
it.each([
  ['pan', 'medialuna'],
  ['medialuna', 'arroz'],
  ['arroz', 'queso'],
  ['queso', 'arroz'],
])('focuses the neighboring row in display order when removing %s', async (removed, neighbor) => {
  mockFetch();
  setup();
  await interpret();
  const remove = screen.getByRole('button', { name: `Quitar ${removed}` });
  remove.focus();
  fireEvent.click(remove);
  expect(screen.queryByRole('button', { name: `Quitar ${removed}` })).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText(`Comida de ${neighbor}`)),
  );
});
it('uses the updated display order after moving a row and focuses the heading after the last removal', async () => {
  mockFetch();
  setup();
  await interpret();
  const selector = screen.getByLabelText('Comida de arroz');
  selector.focus();
  fireEvent.change(selector, { target: { value: 'breakfast' } });
  for (const [removed, neighbor] of [
    ['arroz', 'pan'],
    ['pan', 'medialuna'],
    ['queso', 'medialuna'],
  ] as const) {
    const remove = screen.getByRole('button', { name: `Quitar ${removed}` });
    remove.focus();
    fireEvent.click(remove);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText(`Comida de ${neighbor}`)),
    );
  }
  const remove = screen.getByRole('button', { name: 'Quitar medialuna' });
  remove.focus();
  fireEvent.click(remove);
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Revisá los alimentos' }),
    ),
  );
});
it('preserves focus while editing grams and inclusion', async () => {
  mockFetch();
  setup();
  await interpret();
  const grams = screen.getByLabelText('Gramos de arroz');
  grams.focus();
  fireEvent.change(grams, { target: { value: '42' } });
  expect(document.activeElement).toBe(grams);
  const checkbox = screen.getByRole('checkbox', { name: 'Incluir pan' });
  checkbox.focus();
  fireEvent.click(checkbox);
  expect(document.activeElement).toBe(checkbox);
});
it('requires food for all included items and disables saving with none included', async () => {
  mockFetch();
  setup();
  await interpret();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir medialuna' }));
  expect(screen.getByRole('button', { name: 'Guardar 4 alimentos' }).hasAttribute('disabled')).toBe(
    true,
  );
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  expect(screen.getByRole('button', { name: 'Guardar 0 alimentos' }).hasAttribute('disabled')).toBe(
    true,
  );
});
it('opens custom food with the missing name prefilled and returns to review', async () => {
  mockFetch();
  setup();
  await interpret();
  fireEvent.click(screen.getByRole('button', { name: 'Crear alimento' }));
  expect(screen.getByLabelText('Nombre')).toHaveProperty('value', 'medialuna');
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
  expect(screen.getByText('Total: 175 kcal')).toBeTruthy();
});
it('preserves text and proposal on edit, confirms closing and focuses the safe choice', async () => {
  mockFetch();
  const { onClose } = setup();
  await interpret();
  fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }));
  expect(screen.getByLabelText('¿Qué comiste?')).toHaveProperty('value', 'arroz, pan y medialuna');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(screen.getByText('¿Descartar lo interpretado?')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Seguir revisando' }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir revisando' }));
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
  expect(screen.getByText('Total: 175 kcal')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Sí, descartar' }));
  expect(onClose).toHaveBeenCalledOnce();
});
it.each([-1, 0, 1])(
  'saves exact included batch with date status offset %i and undoes created entries',
  async (offset) => {
    const fetchMock = mockFetch();
    const date = addDays(todayLocal(), offset);
    const { onClose, client } = setup(date);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const refetch = vi.spyOn(client, 'refetchQueries');
    await interpret();
    fireEvent.change(screen.getByLabelText('Gramos de arroz'), { target: { value: '123,4' } });
    fireEvent.change(screen.getByLabelText('Comida de arroz'), { target: { value: 'lunch' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Incluir queso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 2 alimentos' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const batch = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/batch'))!;
    expect(JSON.parse(batch[1]!.body as string)).toEqual({
      date,
      status: offset <= 0 ? 'eaten' : 'planned',
      items: [
        { foodId: food.id, meal: 'lunch', grams: 123.4 },
        { foodId: food.id, meal: 'breakfast', grams: 50 },
      ],
    });
    expect(screen.getByText('Se cargaron 2 alimentos')).toBeTruthy();
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['summary', 'day', date] });
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(2),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url),
    ).toEqual(['http://api.test/api/entries/created-1', 'http://api.test/api/entries/created-2']);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(8));
  },
);
it('keeps review on batch error and hides AI quota when unavailable', async () => {
  const fetchMock = mockFetch();
  fetchMock.mockImplementation(async (input) =>
    String(input).endsWith('/parse-text')
      ? json(response)
      : json({ error: { code: 'not_found', message: 'El alimento ya no existe.' } }, 404),
  );
  const { onClose } = setup(todayLocal(), false);
  await interpret();
  expect(screen.queryByText(/Te quedan/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar 3 alimentos' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'El alimento ya no existe.',
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByText('Total: 175 kcal')).toBeTruthy();
});

it('disables edits while saving and waits for the refreshed summary before closing', async () => {
  const fetchMock = mockFetch();
  let resolveBatch!: (response: Response) => void;
  fetchMock.mockImplementation(async (input) =>
    String(input).endsWith('/parse-text')
      ? json(response)
      : new Promise((resolve) => {
          resolveBatch = resolve;
        }),
  );
  const { client, onClose } = setup();
  let finishRefresh!: () => void;
  const originalRefetch = client.refetchQueries.bind(client);
  vi.spyOn(client, 'refetchQueries').mockImplementation((filters, options) =>
    filters?.queryKey?.[1] === 'day'
      ? new Promise<void>((resolve) => {
          finishRefresh = resolve;
        })
      : originalRefetch(filters, options),
  );
  await interpret();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar 3 alimentos' }));
  await screen.findByRole('button', { name: 'Guardando…' });
  expect(screen.getByRole('button', { name: 'Guardando…' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Editar texto' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Gramos de arroz').closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => resolveBatch(json([{ id: 'created-1' }], 201)));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText('Se cargaron 1 alimentos')).toBeNull();
  await act(async () => finishRefresh());
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
});
it('chooses search results from Open Food Facts only after importing them', async () => {
  const off = { ...food, id: null, name: 'Arroz OFF', barcode: '7791234567890' };
  const fetchMock = mockFetch();
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith('/parse-text')) return json(response);
    if (url.includes('/foods/search')) return json({ items: [off], offAvailable: true });
    if (url.endsWith('/foods/import')) return json({ ...off, id: food.id, kcal: 200 });
    throw new Error(`Unexpected request ${url}`);
  });
  setup();
  await interpret();
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  fireEvent.click(await screen.findByRole('button', { name: /Arroz OFF/ }));
  expect(await screen.findByText('Total: 235 kcal')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Incluir medialuna' })).toHaveProperty(
    'checked',
    true,
  );
  const imported = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/foods/import'))!;
  expect(JSON.parse(imported[1]!.body as string)).toEqual({ barcode: off.barcode });
});
it('keeps the previous proposal when reinterpretation fails', async () => {
  const fetchMock = mockFetch();
  setup();
  await interpret();
  fireEvent.change(screen.getByLabelText('Gramos de arroz'), { target: { value: '40' } });
  fireEvent.click(screen.getByRole('button', { name: 'Editar texto' }));
  fetchMock.mockResolvedValue(
    json({ error: { code: 'text_not_understood', message: 'No entendí.' } }, 422),
  );
  fireEvent.change(screen.getByLabelText('¿Qué comiste?'), { target: { value: 'nuevo texto' } });
  fireEvent.click(screen.getByRole('button', { name: 'Interpretar' }));
  await screen.findByText('No entendí.');
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la revisión' }));
  expect(screen.getByText('Total: 115 kcal')).toBeTruthy();
});
