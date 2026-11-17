// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry } from '@lean/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { RepeatMealSheet } from './RepeatMealSheet';
import { ToastProvider } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { addDays, todayLocal } from '../../lib/date';

const entry: Entry = {
  id: 'entry',
  date: '2026-11-14',
  meal: 'dinner',
  status: 'planned',
  foodId: 'food',
  grams: 150,
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  createdAt: '2026-11-14T20:00:00Z',
  food: {
    id: 'food',
    source: 'seed',
    name: 'Arroz',
    brand: null,
    servingG: null,
    servingLabel: null,
  },
};
function summary(entries: Entry[]): DaySummary {
  return {
    date: entry.date,
    target: null,
    waterMl: 0,
    exerciseKcal: 0,
    eaten: ZERO_MACROS,
    planned: ZERO_MACROS,
    meals: MEALS.map((meal) => ({
      meal,
      eaten: ZERO_MACROS,
      planned: ZERO_MACROS,
      entries: entries.filter((item) => item.meal === meal),
    })),
  };
}
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
function setup(date = todayLocal()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RepeatMealSheet date={date} meal="dinner" onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { client, onClose };
}
it.each([-1, 0, 1])(
  'copies with local destination status for offset %i and undoes only created entries',
  async (offset) => {
    const date = addDays(todayLocal(), offset);
    const get = vi.spyOn(api, 'get').mockResolvedValue(summary([entry]));
    const post = vi.spyOn(api, 'post').mockResolvedValue([
      { ...entry, id: 'copy-1' },
      { ...entry, id: 'copy-2' },
    ]);
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(undefined);
    const { client, onClose } = setup(date);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    expect(await screen.findByText('150 g · 200 kcal')).toBeTruthy();
    expect(get).toHaveBeenCalledWith(
      `/api/summary/day?date=${addDays(date, -1)}`,
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Copiar 1 alimento/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/api/entries/copy', {
      scope: 'meal',
      from: addDays(date, -1),
      to: date,
      meal: 'dinner',
      status: offset <= 0 ? 'eaten' : 'planned',
    });
    expect(screen.getByText('Copiaste 2 alimentos a Cena')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove.mock.calls.map(([path]) => path)).toEqual([
      '/api/entries/copy-1',
      '/api/entries/copy-2',
    ]);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(8));
    for (const queryKey of [
      ['progress', 'entries'],
      ['summary', 'week'],
      ['foods', 'recent'],
      ['foods', 'frequent'],
    ])
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
  },
);
it('skips the destination in both directions and renders empty meals', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue(summary([]));
  setup('2026-11-15');
  expect(await screen.findByText('No cargaste nada en Cena ese día.')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^Copiar$/ }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByLabelText('Día origen siguiente'));
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/summary/day?date=2026-11-16', expect.anything()),
  );
  fireEvent.click(screen.getByLabelText('Día origen anterior'));
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/summary/day?date=2026-11-14', expect.anything()),
  );
  expect(get.mock.calls.some(([path]) => path.includes('2026-11-15'))).toBe(false);
});
it('shows loading, retries errors and keeps the sheet open on copy failure', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(summary([entry]));
  vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
  const { onClose } = setup();
  expect(screen.getByLabelText('Cargando alimentos')).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Arroz');
  expect(get).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: /^Copiar 1 alimento/ }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudo copiar la comida. offline',
  );
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it.each([0, -1])('formats numbers and source dates locally for year offset %i', async (offset) => {
  vi.spyOn(api, 'get').mockResolvedValue(summary([{ ...entry, grams: 1234.5, kcal: 2345.6 }]));
  const year = Number(todayLocal().slice(0, 4)) + offset;
  setup(`${year}-11-17`);
  expect(await screen.findByText('1.234,5 g · 2.345,6 kcal')).toBeTruthy();
  const expected = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    ...(offset ? { year: 'numeric' } : {}),
  }).format(new Date(`${year}-11-16T12:00:00Z`));
  expect(screen.getByText(/ · /, { selector: 'span[aria-live]' }).textContent).toContain(expected);
  expect(screen.getByText(/ · /, { selector: 'span[aria-live]' }).textContent).not.toMatch(
    /\d{4}-/,
  );
});
it('waits for the destination summary before closing and showing the singular toast', async () => {
  vi.spyOn(api, 'get').mockResolvedValue(summary([entry]));
  vi.spyOn(api, 'post').mockResolvedValue([entry]);
  const { client, onClose } = setup();
  let finish!: () => void;
  const originalRefetch = client.refetchQueries.bind(client);
  const refetch = vi.spyOn(client, 'refetchQueries').mockImplementation((filters, options) => {
    if (filters?.queryKey?.[1] === 'day')
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    return originalRefetch(filters, options);
  });
  fireEvent.click(await screen.findByRole('button', { name: /^Copiar 1 alimento a/ }));
  await waitFor(() =>
    expect(refetch).toHaveBeenCalledWith({ queryKey: ['summary', 'day', todayLocal()] }),
  );
  expect(screen.getByRole('button', { name: 'Copiando…' }).hasAttribute('disabled')).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.queryByText('Copiaste 1 alimento a Cena')).toBeNull();
  await act(async () => finish());
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Copiaste 1 alimento a Cena')).toBeTruthy();
});
