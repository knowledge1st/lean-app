// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry, type Food } from '@lean/shared';
import { jsonResponse } from '../auth/testUtils';
import { ToastProvider } from '../components/ui/Toast';
import { activeGoalKey, useCreateGoal } from '../features/goals/api';
import { markWizardSkipped } from '../features/goals/draft';
import { todayLocal } from '../lib/date';
import { Hoy } from './Hoy';
import { setToken, clearToken } from '../lib/session';
import { recalculateSummary } from '../features/diary/optimistic';
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearToken();
  localStorage.clear();
});
const summary: DaySummary = {
  date: '2026-11-14',
  target: null,
  eaten: ZERO_MACROS,
  planned: { kcal: 100, protein: 5, carbs: 10, fat: 2.5 },
  meals: MEALS.map((meal) => ({
    meal,
    eaten: ZERO_MACROS,
    planned: meal === 'breakfast' ? { kcal: 100, protein: 5, carbs: 10, fat: 2.5 } : ZERO_MACROS,
    entries:
      meal === 'breakfast'
        ? [
            {
              id: 'entry',
              date: '2026-11-14',
              meal,
              status: 'planned',
              foodId: 'food',
              grams: 50,
              kcal: 100,
              protein: 5,
              carbs: 10,
              fat: 2.5,
              food: {
                id: 'food',
                source: 'seed',
                name: 'Pan',
                brand: null,
                servingG: null,
                servingLabel: null,
              },
              createdAt: '2026-11-14T12:00:00Z',
            },
          ]
        : [],
  })),
};
const target = { kcal: 2000, protein: 150, carbs: 200, fat: 60, waterMl: 2000 };
const activeGoal = {
  id: 'goal',
  mode: 'manual',
  preset: null,
  startDate: summary.date,
  startWeightKg: 80,
  targetWeightKg: null,
  targetDate: null,
  target,
  milestones: [],
  progress: { startWeightKg: 80, currentWeightKg: 80, targetWeightKg: null, percent: null },
};
function Location() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <>
      <output aria-label="URL">{location.search}</output>
      <output aria-label="Ruta">{location.pathname}</output>
      <output aria-label="Navegación">{navigationType}</output>
    </>
  );
}
function setup(path = '/hoy?fecha=2026-11-14', seed = true, create = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (seed) {
    client.setQueryDefaults(activeGoalKey, { staleTime: Infinity });
    client.setQueryData(activeGoalKey, activeGoal);
    client.setQueryDefaults(['summary', 'week'], { staleTime: Infinity });
    client.setQueryData(['summary', 'week', '2026-W46'], { budgetKcal: null });
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <Routes>
            <Route
              path="/hoy"
              element={
                <>
                  <Hoy />
                  {create && <CreateGoal />}
                </>
              }
            />
            <Route path="/objetivo/nuevo" element={<h1>Nuevo objetivo</h1>} />
          </Routes>
          <Location />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
it.each(['eat', 'delete', 'edit', 'add'] as const)(
  'revierte %s optimista cuando falla la API y muestra aviso',
  async (kind) => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<Response>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      init?.method && init.method !== 'GET'
        ? pending
        : Promise.resolve(
            jsonResponse(
              String(_input).includes('/foods/')
                ? [
                    {
                      id: 'food',
                      source: 'seed',
                      name: 'Arroz',
                      brand: null,
                      barcode: null,
                      kcal: 200,
                      protein: 10,
                      carbs: 20,
                      fat: 5,
                      servingG: null,
                      servingLabel: null,
                    },
                  ]
                : summary,
            ),
          ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = setup();
    await screen.findByText('Pan');
    if (kind === 'eat') fireEvent.click(screen.getByText('Ya lo comí'));
    else if (kind === 'add') {
      fireEvent.click(screen.getByRole('button', { name: 'Agregar a Almuerzo' }));
      await screen.findByText('Arroz');
      fireEvent.click(screen.getByText('Arroz'));
      fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    } else {
      fireEvent.click(screen.getByText('Pan'));
      if (kind === 'edit') {
        fireEvent.change(screen.getByLabelText('Gramos'), { target: { value: '150' } });
        fireEvent.click(screen.getByText('Guardar'));
      } else fireEvent.click(screen.getByText('Borrar'));
    }
    const key = ['summary', 'day', summary.date];
    await waitFor(() => {
      const cached = client.getQueryData<DaySummary>(key)!;
      if (kind === 'eat') expect(cached.eaten.kcal).toBe(100);
      if (kind === 'delete') expect(cached.planned.kcal).toBe(0);
      if (kind === 'edit') expect(cached.planned.kcal).toBe(300);
      if (kind === 'add') expect(cached.eaten.kcal).toBe(200);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      reject(new Error('offline'));
    });
    const messages = {
      add: 'No se pudo agregar.',
      edit: 'No se pudieron guardar los cambios.',
      eat: 'No se pudo marcar como comido.',
      delete: 'No se pudo borrar.',
    };
    expect(await screen.findByText(`${messages[kind]} Revisá tu conexión.`)).toBeTruthy();
    await waitFor(() => expect(client.getQueryData(key)).toEqual(summary));
    expect(screen.getByText('Ya lo comí')).toBeTruthy();
    client.clear();
  },
);
it('reemplaza fecha inválida y conserva la navegación en URL', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(summary)));
  const client = setup('/hoy?fecha=2026-02-30');
  await waitFor(() =>
    expect(screen.getByLabelText('URL').textContent).toBe(`?fecha=${todayLocal()}`),
  );
  fireEvent.click(screen.getByLabelText('Día anterior'));
  expect(screen.getByLabelText('URL').textContent).toContain('fecha=');
  expect(screen.getByRole('heading', { name: /^Ayer/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ayer. Volver a hoy' }));
  expect(screen.getByLabelText('URL').textContent).toBe(`?fecha=${todayLocal()}`);
  client.clear();
});
it('al cambiar de día no presenta datos del anterior durante la carga', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(summary))
      .mockImplementation(() => new Promise(() => {})),
  );
  const client = setup();
  await screen.findByText('Pan');
  fireEvent.click(screen.getByLabelText('Día siguiente'));
  expect(screen.queryByText('Pan')).toBeNull();
  expect(screen.getByLabelText('Cargando día')).toBeTruthy();
  client.clear();
});

it('conserva los datos restaurados si también falla la recarga del resumen', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse(summary))
    .mockRejectedValue(new Error('offline'));
  vi.stubGlobal('fetch', fetchMock);
  const client = setup();
  await screen.findByText('Pan');
  fireEvent.click(screen.getByText('Ya lo comí'));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await waitFor(() =>
    expect(client.getQueryState(['summary', 'day', summary.date])?.status).toBe('error'),
  );
  expect(screen.getByText('Pan')).toBeTruthy();
  expect(screen.getByText('Ya lo comí')).toBeTruthy();
  expect(client.getQueryData(['summary', 'day', summary.date])).toEqual(summary);
  expect(
    screen.getAllByRole('status').find((element) => element.getAttribute('aria-live') === 'polite')
      ?.textContent,
  ).toContain('No se pudo marcar como comido. Revisá tu conexión.');
  client.clear();
});

it('permite dos altas concurrentes y revierte solo la primera cuando falla', async () => {
  const empty = recalculateSummary(summary, []);
  const food: Food = {
    id: 'rice',
    source: 'seed',
    name: 'Arroz',
    brand: null,
    barcode: null,
    kcal: 200,
    protein: 10,
    carbs: 20,
    fat: 5,
    servingG: null,
    servingLabel: null,
  };
  const saved: Entry = {
    ...summary.meals[0]!.entries[0]!,
    id: 'saved-second',
    foodId: food.id!,
    food: { ...food, id: food.id! },
    meal: 'lunch',
    status: 'eaten',
    grams: 100,
    kcal: 201,
    protein: 11,
    carbs: 21,
    fat: 6,
  };
  let rejectFirst!: (error: Error) => void;
  let resolveSecond!: (response: Response) => void;
  let resolveRefresh!: (response: Response) => void;
  const first = new Promise<Response>((_resolve, reject) => {
    rejectFirst = reject;
  });
  const second = new Promise<Response>((resolve) => {
    resolveSecond = resolve;
  });
  const refresh = new Promise<Response>((resolve) => {
    resolveRefresh = resolve;
  });
  let posts = 0;
  let summaryReads = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((input, init) => {
      if (init?.method === 'POST') return ++posts === 1 ? first : second;
      if (String(input).includes('/foods/')) return Promise.resolve(jsonResponse([food]));
      summaryReads++;
      return summaryReads === 1 ? Promise.resolve(jsonResponse(empty)) : refresh;
    }),
  );
  const client = setup();
  await screen.findByRole('button', { name: 'Agregar a Almuerzo' });
  for (let index = 0; index < 2; index++) {
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a Almuerzo' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByText('Arroz'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(posts).toBe(index + 1));
  }
  const key = ['summary', 'day', summary.date];
  expect(client.getQueryData<DaySummary>(key)!.eaten.kcal).toBe(400);
  await act(async () => {
    resolveSecond(jsonResponse(saved));
  });
  await waitFor(() => expect(client.getQueryData<DaySummary>(key)!.eaten.kcal).toBe(401));
  expect(summaryReads).toBe(1);
  expect(client.getQueryData<DaySummary>(key)!.meals[1]!.entries).toHaveLength(2);
  await act(async () => {
    rejectFirst(new Error('offline'));
  });
  expect(await screen.findByText('No se pudo agregar. Revisá tu conexión.')).toBeTruthy();
  expect(client.getQueryData(key)).toEqual(recalculateSummary(empty, [saved]));
  await act(async () => {
    resolveRefresh(jsonResponse(recalculateSummary(empty, [saved])));
  });
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(client.getQueryData(key)).toEqual(recalculateSummary(empty, [saved]));
  expect(screen.getAllByText('Arroz')).toHaveLength(1);
  client.clear();
});

it.each(['error', 'success'] as const)(
  'ignora %s y las invalidaciones de una mutación de la sesión anterior',
  async (outcome) => {
    setToken('first-session');
    let reject!: (error: Error) => void;
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const food: Food = {
      ...summary.meals[0]!.entries[0]!.food,
      barcode: null,
      kcal: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation((input, init) => {
        if (init?.method === 'POST') return pending;
        return Promise.resolve(jsonResponse(String(input).includes('/foods/') ? [food] : summary));
      }),
    );
    const client = setup();
    await screen.findByText('Pan');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar a Almuerzo' }));
    fireEvent.click(await within(screen.getByRole('dialog')).findByText('Pan'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const key = ['summary', 'day', summary.date];
    await waitFor(() => expect(client.getQueryData<DaySummary>(key)!.eaten.kcal).toBe(200));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const setData = vi.spyOn(client, 'setQueryData');
    await act(async () => {
      // Logout unmounts Hoy before clearing the old session cache.
      cleanup();
      clearToken();
      client.clear();
      setToken('second-session');
      client.setQueryData(key, recalculateSummary(summary, []));
    });
    const otherSession = client.getQueryData(key);
    setData.mockClear();
    await act(async () => {
      if (outcome === 'error') reject(new Error('offline'));
      else resolve(jsonResponse({ ...summary.meals[0]!.entries[0]!, status: 'eaten' }));
    });
    expect(setData).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryData(key)).toBe(otherSession);
    expect(screen.queryByText('No se pudo agregar. Revisá tu conexión.')).toBeNull();
    client.clear();
  },
);

function CreateGoal() {
  const mutation = useCreateGoal();
  return (
    <button
      onClick={() =>
        mutation.mutate({
          goal: { mode: 'manual', kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60 },
          weightKg: 80,
        })
      }
    >
      Crear objetivo
    </button>
  );
}

it('muestra lo restante y las metas de macros del resumen diario y el presupuesto semanal', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockImplementation((input) =>
        Promise.resolve(
          jsonResponse(
            String(input).includes('/goals/')
              ? activeGoal
              : String(input).includes('/summary/week')
                ? { budgetKcal: 14000, eatenKcal: 4550, remainingKcal: 9450 }
                : { ...summary, target, eaten: { kcal: 500, protein: 30, carbs: 40, fat: 10 } },
          ),
        ),
      ),
  );
  const client = setup(undefined, false);
  expect(await screen.findByText('quedan 1500 kcal')).toBeTruthy();
  expect(await screen.findByText('Te quedan 9.450 kcal esta semana')).toBeTruthy();
  const proteinValue = screen.getByText('30 / 150 g');
  expect(proteinValue).toBeTruthy();
  const proteinBar = proteinValue.parentElement?.nextElementSibling
    ?.firstElementChild as HTMLElement;
  expect(proteinBar.style.width).toBe('20%');
  expect(screen.getByText('40 / 200 g')).toBeTruthy();
  expect(screen.getByText('10 / 60 g')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4550');
  client.clear();
});

it.each(['redirect', 'skipped', 'error', 'loading'] as const)(
  'maneja el objetivo al ingresar: %s',
  async (state) => {
    if (state === 'skipped') markWizardSkipped();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation((input) => {
        if (String(input).includes('/goals/')) {
          if (state === 'loading') return new Promise(() => {});
          return Promise.resolve(
            jsonResponse(
              {
                error: {
                  code: state === 'error' ? 'server_error' : 'goal_not_found',
                  message: 'No se pudo cargar el objetivo.',
                },
              },
              state === 'error' ? 500 : 404,
            ),
          );
        }
        return Promise.resolve(
          jsonResponse(String(input).includes('/summary/week') ? { budgetKcal: null } : summary),
        );
      }),
    );
    const client = setup(undefined, false);
    if (state === 'redirect') {
      await screen.findByText('Nuevo objetivo');
      expect(screen.getByLabelText('Ruta').textContent).toBe('/objetivo/nuevo');
      expect(screen.getByLabelText('Navegación').textContent).toBe('REPLACE');
    } else {
      if (state === 'error') await screen.findByText('No se pudo cargar tu objetivo.');
      else if (state === 'skipped') {
        await screen.findByText('Definí tu objetivo para ver cuánto te queda');
        expect(screen.getByRole('link', { name: 'Definir objetivo' }).getAttribute('href')).toBe(
          '/objetivo/nuevo',
        );
      } else await screen.findByText('Pan');
      expect(screen.getByLabelText('Ruta').textContent).toBe('/hoy');
      expect(
        (await screen.findByRole('link', { name: 'Definí tu objetivo' })).getAttribute('href'),
      ).toBe('/objetivo/nuevo');
    }
    client.clear();
  },
);

it('actualiza las metas y el presupuesto al crear un objetivo e invalidar los resúmenes', async () => {
  markWizardSkipped();
  let created = false;
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((input, init) => {
      const url = String(input);
      if (init?.method === 'POST') {
        created = true;
        return Promise.resolve(jsonResponse({ goal: activeGoal, plan: {} }));
      }
      if (url.includes('/goals/'))
        return Promise.resolve(
          created
            ? jsonResponse(activeGoal)
            : jsonResponse({ error: { code: 'goal_not_found', message: 'Sin objetivo.' } }, 404),
        );
      if (url.includes('/summary/week'))
        return Promise.resolve(
          jsonResponse({
            budgetKcal: created ? 14000 : null,
            eatenKcal: 4550,
            remainingKcal: created ? 9450 : null,
          }),
        );
      return Promise.resolve(jsonResponse({ ...summary, target: created ? target : null }));
    }),
  );
  const client = setup(undefined, false, true);
  await screen.findByText('Definí tu objetivo para ver cuánto te queda');
  expect(screen.queryByText('quedan 2000 kcal')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Crear objetivo' }));
  expect(await screen.findByText('quedan 2000 kcal')).toBeTruthy();
  expect(await screen.findByText('Te quedan 9.450 kcal esta semana')).toBeTruthy();
  expect(screen.queryByText('Definí tu objetivo para ver cuánto te queda')).toBeNull();
  client.clear();
});
