// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MEALS, ZERO_MACROS, type DaySummary } from '@lean/shared';
import { WeekStrip } from './WeekStrip';
import { summaryKey } from '../diary/api';
vi.mock('../../lib/date', async (original) => ({
  ...(await original<typeof import('../../lib/date')>()),
  todayLocal: () => '2026-11-16',
}));
afterEach(cleanup);
it('presenta siete días, totales, estados accesibles, hoy y selección', () => {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${16 + i}`);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  dates.forEach((date, index) => {
    const summary: DaySummary = {
      date,
      eaten: { ...ZERO_MACROS, kcal: index === 4 || index === 5 ? 0 : 500 },
      planned: { ...ZERO_MACROS, kcal: [500, 600, 700, 0, 0, 0, 0][index]! },
      target: index !== 3 ? { kcal: 1000, protein: 100, carbs: 100, fat: 50, waterMl: 2000 } : null,
      waterMl: 0,
      exerciseKcal: 0,
      meals: MEALS.map((meal) => ({
        meal,
        eaten: ZERO_MACROS,
        planned: ZERO_MACROS,
        entries:
          meal === 'lunch' && index !== 4
            ? [
                {
                  ...ZERO_MACROS,
                  id: date,
                  date,
                  meal,
                  status: index === 5 ? 'eaten' : 'planned',
                  foodId: 'food',
                  grams: 100,
                  createdAt: `${date}T12:00:00Z`,
                  food: {
                    id: 'food',
                    source: 'seed',
                    name: 'Agua',
                    brand: null,
                    servingG: null,
                    servingLabel: null,
                  },
                },
              ]
            : [],
      })),
    };
    client.setQueryData(summaryKey(date), summary);
  });
  const select = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <WeekStrip dates={dates} selected={dates[0]!} onSelect={select} />
    </QueryClientProvider>,
  );
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(7);
  for (const button of buttons) {
    expect(button.lastElementChild?.classList.contains('h-6')).toBe(true);
  }
  for (const index of [3, 4]) {
    expect(buttons[index]!.lastElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(buttons[index]!.lastElementChild?.textContent).toBe('');
  }
  expect(
    screen.getByRole('button', { name: 'lun, 16 nov · 1.000 kcal · dentro de la meta · hoy' }),
  ).toBe(buttons[0]);
  expect(screen.getByRole('button', { name: 'mar, 17 nov · 1.100 kcal · cerca de la meta' })).toBe(
    buttons[1],
  );
  expect(screen.getByRole('button', { name: 'mié, 18 nov · 1.200 kcal · lejos de la meta' })).toBe(
    buttons[2],
  );
  expect(screen.getByRole('button', { name: 'vie, 20 nov · 0 kcal' })).toBe(buttons[4]);
  expect(within(buttons[4]!).queryByLabelText(/meta/)).toBeNull();
  expect(within(buttons[4]!).getByText('0')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'sáb, 21 nov · 0 kcal · lejos de la meta' })).toBe(
    buttons[5],
  );
  expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true');
  expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false');
  expect(within(buttons[0]!).getByLabelText('Dentro de la meta').textContent).toBe('✓');
  expect(within(buttons[1]!).getByLabelText('Cerca de la meta').className).toContain(
    'text-warning',
  );
  expect(within(buttons[2]!).getByLabelText('Lejos de la meta').className).toContain('text-danger');
  expect(within(buttons[3]!).queryByLabelText(/meta/)).toBeNull();
  expect(within(buttons[3]!).getByText('500')).toBeTruthy();
  fireEvent.click(buttons[1]!);
  expect(select).toHaveBeenCalledWith(dates[1]);
  client.clear();
});

it('una semana vacía con meta muestra siete ceros sin indicadores', () => {
  const dates = Array.from({ length: 7 }, (_, i) => `2026-11-${16 + i}`);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  for (const date of dates) {
    const summary: DaySummary = {
      date,
      eaten: ZERO_MACROS,
      planned: ZERO_MACROS,
      target: { kcal: 1000, protein: 100, carbs: 100, fat: 50, waterMl: 2000 },
      waterMl: 0,
      exerciseKcal: 0,
      meals: MEALS.map((meal) => ({ meal, eaten: ZERO_MACROS, planned: ZERO_MACROS, entries: [] })),
    };
    client.setQueryData(summaryKey(date), summary);
  }
  render(
    <QueryClientProvider client={client}>
      <WeekStrip dates={dates} selected={dates[0]!} onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole('button', { name: /0 kcal/ })).toHaveLength(7);
  expect(screen.getAllByText('0')).toHaveLength(7);
  expect(screen.queryByLabelText(/meta/)).toBeNull();
  client.clear();
});

it('muestra carga sin ceros y reúne los errores con un único reintento', async () => {
  const dates = ['2026-11-16', '2026-11-17'];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WeekStrip dates={dates} selected={dates[0]!} onSelect={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.getAllByRole('button', { name: /cargando/ })).toHaveLength(2);
  expect(screen.queryByText('0')).toBeNull();
  await screen.findByText('No se pudieron cargar algunos días');
  expect(screen.getAllByRole('button', { name: /sin datos/ })).toHaveLength(2);
  expect(screen.getAllByText('—')).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
  const calls = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(fetchMock.mock.calls.length).toBe(calls + 2));
  await screen.findByText('No se pudieron cargar algunos días');
  fetchMock.mockRestore();
  client.clear();
});
