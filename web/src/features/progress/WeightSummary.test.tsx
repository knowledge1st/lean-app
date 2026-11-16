// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ActiveGoal } from '@lean/shared';
import { WeightSummary } from './WeightSummary';
import { log } from './testFixtures';
afterEach(cleanup);
it.each([
  [80, 70, 74.6, 'delante'],
  [80, 70, 75.4, 'detrás'],
  [70, 80, 75.4, 'delante'],
  [70, 80, 74.6, 'detrás'],
])('muestra el sentido correcto de %s a %s', (startWeightKg, targetWeightKg, trend, direction) => {
  const goal = {
    startDate: '2026-01-01',
    startWeightKg,
    targetWeightKg,
    milestones: [{ date: '2026-01-11', expectedWeightKg: targetWeightKg, kind: 'final' }],
  } as ActiveGoal;
  render(<WeightSummary logs={[log('2026-01-06', trend)]} goal={goal} today="2026-01-06" />);
  expect(screen.getByText(`0,4 kg por ${direction} del plan`)).toBeTruthy();
});
it('usa el primer peso sin objetivo y la última tendencia no nula', () => {
  render(
    <WeightSummary
      logs={[log('2026-01-01', 80), log('2026-01-02', 77.7), log('2026-01-03', 77, null)]}
      today="2026-01-03"
    />,
  );
  expect(screen.getByText('−2,3 kg desde el inicio')).toBeTruthy();
  expect(screen.queryByText(/esperado|plan/i)).toBeNull();
});
