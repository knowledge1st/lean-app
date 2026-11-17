// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Entry } from '@lean/shared';
import WeekBars from './WeekBars';
import { weekSummary } from './testFixtures';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ComposedChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: ({ dot, activeDot }: { dot: boolean; activeDot: boolean }) => (
    <div data-testid="goal-line" data-dot={String(dot)} data-active-dot={String(activeDot)} />
  ),
  Bar: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
afterEach(cleanup);
it('oculta solo el detalle diario accesible y desactiva los marcadores de la meta', () => {
  const { container } = render(
    <WeekBars
      summary={weekSummary}
      entries={[{ date: weekSummary.from, status: 'eaten', protein: 75 } as Entry]}
    />,
  );
  const line = screen.getByTestId('goal-line');
  expect(line.getAttribute('data-dot')).toBe('false');
  expect(line.getAttribute('data-active-dot')).toBe('false');
  const caption = container.querySelector('figcaption')!;
  expect(caption.classList.contains('sr-only')).toBe(true);
  expect(caption.getAttribute('aria-hidden')).toBeNull();
  expect(caption.textContent).toContain('2.100 kcal');
  for (const text of ['1 de 7 días registrados', 'Promedio de proteína: 75 g por día registrado']) {
    expect(screen.getByText(text).closest('.sr-only, [aria-hidden="true"]')).toBeNull();
  }
});

it('explica la semana sin comidas registradas', () => {
  render(<WeekBars summary={{ ...weekSummary, loggedDays: 0 }} entries={[]} />);
  expect(
    screen.getByText('Todavía no hay comidas registradas esta semana. Cargalas desde Hoy.'),
  ).toBeTruthy();
  expect(screen.queryByTestId('goal-line')).toBeNull();
});
