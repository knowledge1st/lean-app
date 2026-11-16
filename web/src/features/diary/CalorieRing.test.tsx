// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CalorieRing } from './CalorieRing';

afterEach(cleanup);
it('separa los miles en el consumo y las calorías restantes', () => {
  render(<CalorieRing kcal={1800} target={3000} />);
  expect(screen.getByText('1.800')).toBeTruthy();
  expect(screen.getByText('quedan 1.200 kcal')).toBeTruthy();
});
it('separa los miles en las calorías de más', () => {
  render(<CalorieRing kcal={3250} target={2000} />);
  expect(screen.getByText('3.250')).toBeTruthy();
  expect(screen.getByText('1.250 kcal de más')).toBeTruthy();
});
