// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: /^Copiar 1 alimentos/ }));
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
      ['summary', 'day', date],
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
  expect(screen.getByRole('button', { name: /^Copiar 0 alimentos/ }).hasAttribute('disabled')).toBe(
    true,
  );
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
  fireEvent.click(screen.getByRole('button', { name: /^Copiar 1 alimentos/ }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    'No se pudo copiar la comida. offline',
  );
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
