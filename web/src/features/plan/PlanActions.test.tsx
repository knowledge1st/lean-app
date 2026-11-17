// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { PropsWithChildren } from 'react';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { jsonResponse } from '../../auth/testUtils';
import { ToastProvider } from '../../components/ui/Toast';
import { summaryKey, useDiaryMutation } from '../diary/api';
import { PlanActions } from './PlanActions';

vi.mock('../../lib/api', async (original) => {
  const actual = await original<typeof import('../../lib/api')>();
  return { ...actual, api: actual.createApiClient({ baseUrl: 'http://localhost' }) };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const date = '2026-11-17';
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
const saved: Entry = {
  id: 'saved-entry',
  date,
  meal: 'lunch',
  status: 'planned',
  foodId: food.id,
  food,
  grams: 100,
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  createdAt: `${date}T12:00:00Z`,
};
function day(dayDate = date, entries: Entry[] = []): DaySummary {
  return {
    date: dayDate,
    eaten: ZERO_MACROS,
    planned: entries.length ? { kcal: 200, protein: 10, carbs: 20, fat: 5 } : ZERO_MACROS,
    target: null,
    waterMl: 0,
    exerciseKcal: 0,
    meals: MEALS.map((meal) => ({
      meal,
      eaten: ZERO_MACROS,
      planned: meal === 'lunch' && entries.length ? saved : ZERO_MACROS,
      entries: meal === 'lunch' ? entries : [],
    })),
  };
}
function setup() {
  let finishAdd!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    finishAdd = resolve;
  });
  let entries: Entry[] = [];
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = String(input);
    if (init?.method === 'POST' && url.endsWith('/api/entries')) return pending;
    if (init?.method === 'DELETE') {
      entries = entries.filter((entry) => !url.endsWith(`/${entry.id}`));
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (init?.method === 'POST') return Promise.resolve(jsonResponse([]));
    const requestedDate = new URL(url).searchParams.get('date')!;
    return Promise.resolve(jsonResponse(day(requestedDate, requestedDate === date ? entries : [])));
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(summaryKey(date), day());
  // Keep the prop stale: clearing must read the updated cache instead.
  const staleSummary = day(date, [{ ...saved, id: 'temp-add' }]);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ToastProvider>
          <PlanActions week="2026-W47" summary={staleSummary} />
          {children}
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const { result } = renderHook(() => useDiaryMutation(), { wrapper });
  fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
  function startAlongside(button?: HTMLElement) {
    act(() => {
      result.current.mutate({
        kind: 'add',
        date,
        meal: 'lunch',
        food,
        grams: 100,
        status: 'planned',
        temporaryId: 'temp-add',
      });
      // Simulate an action fired before the mutation notification disables the button.
      button?.click();
    });
  }
  async function expectWaiting() {
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/entries')),
      ).toHaveLength(1),
    );
    expect(client.getQueryData<DaySummary>(summaryKey(date))!.meals[1]!.entries[0]!.id).toBe(
      'temp-add',
    );
    expect(screen.getByText('Esperando…')).toBeTruthy();
    for (const button of screen.getByRole('dialog').querySelectorAll('button')) {
      if (button.getAttribute('aria-label') !== 'Cerrar') expect(button.disabled).toBe(true);
    }
  }
  async function completeAdd() {
    await act(async () => {
      entries = [saved];
      finishAdd(jsonResponse(saved));
    });
  }
  return { client, fetchMock, startAlongside, expectWaiting, completeAdd };
}
it('espera el alta antes de consultar destinos y pregunta agregar/reemplazar al copiar semana', async () => {
  const { client, fetchMock, startAlongside, expectWaiting, completeAdd } = setup();
  startAlongside(screen.getByRole('button', { name: 'Copiar la semana anterior' }));
  await expectWaiting();
  expect(fetchMock.mock.calls).toHaveLength(1);
  await completeAdd();
  await screen.findByText('El destino ya tiene comidas planificadas');
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/summary/day'))).toHaveLength(
    7,
  );
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/entries/copy'))).toBe(false);
  expect(screen.getByRole('button', { name: 'Reemplazar' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  await screen.findByText('Copiaste la semana');
  const copy = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/entries/copy'))!;
  expect(JSON.parse(String(copy[1]?.body))).toEqual({
    scope: 'week',
    from: '2026-W46',
    to: '2026-W47',
    mode: 'append',
  });
  client.clear();
});
it('espera el alta y vacía con el id real de caché, ignorando ids temporales', async () => {
  const { client, fetchMock, startAlongside, expectWaiting, completeAdd } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Vaciar lo planificado del día' }));
  startAlongside(screen.getByRole('button', { name: 'Vaciar' }));
  await expectWaiting();
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  // Even a leftover temporary entry in the cache must never be sent to DELETE.
  const unsubscribe = client.getMutationCache().subscribe((event) => {
    if (
      event.type === 'updated' &&
      event.mutation.state.status === 'success' &&
      event.mutation.state.variables?.kind === 'add'
    ) {
      client.setQueryData(summaryKey(date), day(date, [saved, { ...saved, id: 'temp-leftover' }]));
    }
  });
  await completeAdd();
  await screen.findByText('¿Querés borrar 1 entrada planificada de este día?');
  fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }));
  await screen.findByText('Plan del día vaciado');
  unsubscribe();
  const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
  expect(deletes.map(([url]) => String(url))).toEqual(['http://localhost/api/entries/saved-entry']);
  client.clear();
});
it('espera el alta antes de generar la lista de compras', async () => {
  const { client, fetchMock, startAlongside, expectWaiting, completeAdd } = setup();
  startAlongside(screen.getByRole('button', { name: 'Generar lista de compras' }));
  await expectWaiting();
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/shopping/generate'))).toBe(
    false,
  );
  await completeAdd();
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/shopping/generate'))).toBe(
      true,
    ),
  );
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/shopping/generate'))!;
  expect(JSON.parse(String(call[1]?.body))).toEqual({ week: '2026-W47' });
  await waitFor(() => expect(client.isMutating()).toBe(0));
  client.clear();
});

it('deshabilita las acciones mientras otra instancia del diario está pendiente', async () => {
  const { client, fetchMock, startAlongside, completeAdd } = setup();
  startAlongside();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  for (const name of [
    'Copiar este día a…',
    'Copiar la semana anterior',
    'Vaciar lo planificado del día',
    'Generar lista de compras',
  ]) {
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  }
  await completeAdd();
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Generar lista de compras' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  client.clear();
});

it('anuncia la consulta de destinos y la copia en curso', async () => {
  const { client, fetchMock } = setup();
  let finishDays!: (response: Response) => void;
  let finishCopy!: (response: Response) => void;
  const destinations = new Promise<Response>((resolve) => {
    finishDays = resolve;
  });
  const copying = new Promise<Response>((resolve) => {
    finishCopy = resolve;
  });
  fetchMock.mockImplementation((_input, init) =>
    init?.method === 'POST' ? copying : destinations.then((response) => response.clone()),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Copiar la semana anterior' }));
  expect(await screen.findByText('Cargando días…')).toHaveProperty('role', 'status');
  await act(async () => {
    finishDays(jsonResponse(day()));
  });
  expect(await screen.findByText('Copiando…')).toHaveProperty('role', 'status');
  expect(
    (screen.getByRole('button', { name: 'Copiar la semana anterior' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => {
    finishCopy(jsonResponse([]));
  });
  await screen.findByText('Copiaste la semana');
  client.clear();
});

it('anuncia la generación de compras y ofrece Ver al finalizar', async () => {
  const { client, fetchMock } = setup();
  let finish!: (response: Response) => void;
  fetchMock.mockReturnValue(
    new Promise<Response>((resolve) => {
      finish = resolve;
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Generar lista de compras' }));
  expect(await screen.findByText('Generando lista…')).toHaveProperty('role', 'status');
  await act(async () => {
    finish(jsonResponse([]));
  });
  await screen.findByText('Lista de compras actualizada');
  expect(screen.getByRole('button', { name: 'Ver' })).toBeTruthy();
  client.clear();
});
