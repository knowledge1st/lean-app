// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Food } from '@lean/shared';
import { FoodResultRow } from './FoodResultRow';

afterEach(cleanup);
it('muestra la fuente completa, nombres de dos líneas y calorías locales', () => {
  const food: Food = {
    id: 'food',
    source: 'off',
    createdByMe: false,
    name: 'Pan integral con semillas',
    brand: 'Panadería artesanal',
    barcode: null,
    servingG: null,
    servingLabel: null,
    kcal: 123.5,
    protein: 0,
    carbs: 0,
    fat: 0,
  };
  const onSelect = vi.fn();
  render(<FoodResultRow food={food} onSelect={onSelect} />);
  expect(screen.getByText('Open Food Facts')).toBeTruthy();
  expect(screen.getByText('123,5 kcal / 100 g')).toBeTruthy();
  for (const text of [food.name, food.brand!]) {
    expect(screen.getByTitle(text).className).toContain('line-clamp-2');
    expect(screen.getByTitle(text).textContent).toBe(text);
  }
  const button = screen.getByRole('button');
  expect(button.className).toContain('min-h-11');
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledWith(food);
});
