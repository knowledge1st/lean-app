// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ActiveGoal } from '@lean/shared';
import WeightChart from './WeightChart';
import { WeightSummary } from './WeightSummary';
import { log } from './testFixtures';
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  LineChart: () => null,
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
  expect(screen.getByText(/Registrado/)).toBeTruthy();
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
