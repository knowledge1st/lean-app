// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Food } from '@lean/shared';
import { QuantityStep } from './QuantityStep';
afterEach(cleanup);
const food: Food = {
  id: 'food',
  source: 'seed',
  name: 'Pan',
  brand: null,
  barcode: null,
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  servingG: null,
  servingLabel: null,
};
function setup(overrides: Partial<Food> = {}) {
  const onAdd = vi.fn();
  render(<QuantityStep food={{ ...food, ...overrides }} onBack={vi.fn()} onAdd={onAdd} />);
  return onAdd;
}
function grams(value: string) {
  fireEvent.change(screen.getByLabelText('Gramos'), { target: { value } });
}
it('inicia con 100 y actualiza las cuatro macros en vivo', () => {
  setup();
  expect((screen.getByLabelText('Gramos') as HTMLInputElement).value).toBe('100');
  grams('150');
  expect(screen.getByText('300 kcal')).toBeTruthy();
  expect(screen.getByText('Proteína: 15 g')).toBeTruthy();
  expect(screen.getByText('Carbohidratos: 30 g')).toBeTruthy();
  expect(screen.getByText('Grasa: 7,5 g')).toBeTruthy();
  grams('50');
  expect(screen.getByText('100 kcal')).toBeTruthy();
});
it('inicia con la porción y permite media, una y dos porciones', () => {
  setup({ servingG: 33.3, servingLabel: '1 rebanada' });
  const input = screen.getByLabelText('Gramos') as HTMLInputElement;
  expect(input.value).toBe('33.3');
  fireEvent.click(screen.getByRole('button', { name: /½ porción/ }));
  expect(input.value).toBe('16.7');
  fireEvent.click(screen.getByRole('button', { name: /^2 porciones/ }));
  expect(input.value).toBe('66.6');
  fireEvent.click(screen.getByRole('button', { name: /^1 porción/ }));
  expect(input.value).toBe('33.3');
});
it('acepta coma y envía gramos numéricos', () => {
  const add = setup();
  grams('150,5');
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  expect(add).toHaveBeenCalledWith(150.5);
  expect(screen.getByLabelText('Gramos').getAttribute('inputmode')).toBe('decimal');
});
it.each(['', '0', '-1', '5000.1', '1.23', 'texto', '1,2,3'])(
  'deshabilita cantidades inválidas: %s',
  (value) => {
    const add = setup();
    grams(value);
    const button = screen.getByRole('button', { name: 'Agregar' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(add).not.toHaveBeenCalled();
  },
);
it('vuelve a búsqueda', () => {
  const onBack = vi.fn();
  render(<QuantityStep food={food} onBack={onBack} onAdd={vi.fn()} />);
  fireEvent.click(screen.getByText('Volver'));
  expect(onBack).toHaveBeenCalledOnce();
});

it('limita una etiqueta de porción sin espacios y conserva los gramos visibles', () => {
  const label = 'W'.repeat(40);
  setup({ name: 'N'.repeat(100), brand: 'B'.repeat(100), servingG: 50, servingLabel: label });
  const button = screen.getByRole('button', { name: new RegExp(`1 porción · ${label}`) });
  expect(button.className).toContain('max-w-full min-w-0');
  expect(button.querySelector('.truncate')?.textContent).toContain(label);
  expect(button.querySelector('.shrink-0')?.textContent).toBe('(50 g)');
});
