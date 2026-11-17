// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
      eaten: { ...ZERO_MACROS, kcal: 500 },
      planned: { ...ZERO_MACROS, kcal: [500, 600, 700, 0, 0, 0, 0][index]! },
      target: index < 3 ? { kcal: 1000, protein: 100, carbs: 100, fat: 50, waterMl: 2000 } : null,
      waterMl: 0,
      exerciseKcal: 0,
      meals: MEALS.map((meal) => ({ meal, eaten: ZERO_MACROS, planned: ZERO_MACROS, entries: [] })),
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
  expect(buttons[0]!.getAttribute('aria-label')).toContain('hoy');
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
