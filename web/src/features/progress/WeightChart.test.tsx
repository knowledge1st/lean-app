// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { fireEvent } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ActiveGoal } from '@lean/shared';
import WeightChart from './WeightChart';
import { WeightSummary } from './WeightSummary';
import { log } from './testFixtures';
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReferenceLine: ({
    x,
    strokeDasharray,
    label,
  }: {
    x: number;
    strokeDasharray: string;
    label: { value: string; position: string; fontSize: number; fill: string };
  }) => (
    <span
      data-testid="reference"
      data-x={x}
      data-dash={strokeDasharray}
      data-position={label.position}
      style={{ fontSize: label.fontSize, color: label.fill }}
    >
      {label.value}
    </span>
  ),
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));
afterEach(cleanup);
it('sin objetivo de peso no incluye Esperado en la leyenda ni en los resúmenes', () => {
  const goal = {
    startDate: '2026-01-01',
    startWeightKg: 80,
    targetWeightKg: null,
    milestones: [{ date: '2026-02-01', expectedWeightKg: 78, kind: 'week' }],
  } as ActiveGoal;
  const logs = [log('2026-01-02', 79.5)];
  render(
    <>
      <WeightChart logs={logs} goal={goal} today="2026-01-02" />
      <WeightSummary logs={logs} goal={goal} today="2026-01-02" />
    </>,
  );
  expect(screen.getByText('● Registrado')).toBeTruthy();
  expect(screen.getByText('━ Tendencia')).toBeTruthy();
  expect(screen.queryByText(/esperado|objetivo:|del plan/i)).toBeNull();
  expect(screen.getByText(/1 registros de peso en el rango/)).toBeTruthy();
});
it('incluye el esperado de hoy y el objetivo cuando hay trayectoria', () => {
  const goal = {
    startDate: '2026-01-01',
    startWeightKg: 80,
    targetWeightKg: 70,
    milestones: [{ date: '2026-01-11', expectedWeightKg: 70, kind: 'final' }],
  } as ActiveGoal;
  render(<WeightChart logs={[log('2026-01-06', 75.4)]} goal={goal} today="2026-01-06" />);
  expect(screen.getByText('┄ Esperado')).toBeTruthy();
  expect(screen.getByText(/Peso esperado hoy: 75 kg. Objetivo: 70 kg/)).toBeTruthy();
});

it('marca fechas en el dominio visible con timestamps y descripción accesible', () => {
  render(
    <WeightChart
      logs={[log('2025-11-01', 80)]}
      today="2026-01-15"
      goalChanges={['2025-11-20', '2026-01-01', '2026-01-16']}
    />,
  );
  expect(screen.getAllByTestId('reference')).toHaveLength(1);
  expect(screen.getByTestId('reference').getAttribute('data-x')).toBe(
    String(Date.parse('2026-01-01T12:00:00Z')),
  );
  expect(screen.getByTestId('reference').getAttribute('data-dash')).toBe('4 4');
  expect(screen.getByRole('list', { name: 'Cambios de meta' }).textContent).toContain(
    'Cambio de meta',
  );
  fireEvent.click(screen.getByRole('button', { name: '3 meses' }));
  expect(screen.getAllByTestId('reference')).toHaveLength(2);
});

it.each([
  ['2025-12-16', 'insideTopLeft', '16 dic'],
  ['2026-01-15', 'insideTopRight', '15 ene'],
])(
  'ubica la etiqueta corta hacia el interior del rango para %s',
  (date, position, formattedDate) => {
    render(<WeightChart logs={[]} today="2026-01-15" goalChanges={[date]} />);
    const reference = screen.getByTestId('reference');
    expect(reference.textContent).toBe('Meta');
    expect(reference.getAttribute('data-position')).toBe(position);
    expect(reference.style.fontSize).toBe('11px');
    expect(reference.style.color).toBe('var(--muted)');
    expect(screen.getByRole('list', { name: 'Cambios de meta' }).textContent).toBe(
      `Cambio de meta: ${formattedDate}`,
    );
  },
);

it('ofrece fechas y valores del rango en una tabla accesible', () => {
  render(
    <WeightChart logs={[log('2026-01-02', 79.5), log('2026-01-03', 79)]} today="2026-01-03" />,
  );
  fireEvent.click(screen.getByText('Ver datos'));
  const table = screen.getByRole('table');
  expect(table.textContent).toContain('2 ene');
  expect(table.textContent).toContain('79,5 kg');
  expect(table.textContent).toContain('3 ene');
  expect(table.textContent).toContain('79 kg');
});
