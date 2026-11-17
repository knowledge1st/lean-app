// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CheckinDetailSheet } from './CheckinDetailSheet';
import { checkin } from './testFixtures';
afterEach(cleanup);
it.each([
  [0.04, '0 kg/semana'],
  [-0.04, '0 kg/semana'],
  [0.05, '+0,1 kg/semana'],
  [-0.05, '−0,1 kg/semana'],
])('muestra real y esperado %s con el signo de la precisión visible', (value, text) => {
  render(
    <CheckinDetailSheet
      checkin={{ ...checkin, actualWeeklyChangeKg: value, expectedWeeklyChangeKg: value }}
      open
      onOpenChange={() => {}}
    />,
  );
  expect(screen.getAllByText(text)).toHaveLength(2);
});
it('muestra métricas con unidades, signo y comparación de macros', () => {
  const onOpenChange = vi.fn();
  render(<CheckinDetailSheet checkin={checkin} open onOpenChange={onOpenChange} />);
  expect(screen.getByText('2.000 kcal/día')).toBeTruthy();
  expect(screen.getByText('2.400 kcal/día')).toBeTruthy();
  expect(screen.getByText('−0,2 kg/semana')).toBeTruthy();
  expect(screen.getByText('−0,5 kg/semana')).toBeTruthy();
  for (const [name, current, proposed] of [
    ['Calorías (kcal)', '2.000', '1.850'],
    ['Proteína (g)', '150', '150'],
    ['Carbohidratos (g)', '200', '170'],
    ['Grasa (g)', '67', '63'],
  ]) {
    const row = screen.getByRole('row', { name: `${name} ${current} ${proposed}` });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual([current, proposed]);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});
it('muestra guiones para valores ausentes y signo positivo para subas', () => {
  render(
    <CheckinDetailSheet
      checkin={{
        ...checkin,
        avgIntakeKcal: null,
        estimatedTdee: null,
        actualWeeklyChangeKg: null,
        expectedWeeklyChangeKg: 0.5,
        proposed: null,
      }}
      open
      onOpenChange={() => {}}
    />,
  );
  expect(screen.getAllByText('—')).toHaveLength(7);
  expect(screen.getByText('+0,5 kg/semana')).toBeTruthy();
});
