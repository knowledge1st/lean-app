// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DaySummary, Entry } from '@lean/shared';
import { ZERO_MACROS } from '@lean/shared';
import { MealSection } from './MealSection';
afterEach(cleanup);
const entry: Entry = {
  id: 'entry',
  date: '2026-11-14',
  meal: 'breakfast',
  status: 'planned',
  foodId: 'food',
  grams: 50,
  kcal: 100,
  protein: 5,
  carbs: 10,
  fat: 2.5,
  food: {
    id: 'food',
    name: 'Pan',
    brand: 'Marca',
    source: 'seed',
    servingG: null,
    servingLabel: null,
  },
  createdAt: '2026-11-14T12:00:00Z',
};
const meal: DaySummary['meals'][number] = {
  meal: 'breakfast',
  eaten: { ...ZERO_MACROS, kcal: 314 },
  planned: { ...ZERO_MACROS, kcal: 100 },
  entries: [entry],
};
it('muestra subtotales de la API, lista y acciones independientes', () => {
  const onAdd = vi.fn(),
    onEdit = vi.fn(),
    onEat = vi.fn();
  render(<MealSection meal={meal} onAdd={onAdd} onEdit={onEdit} onEat={onEat} />);
  expect(screen.getByText('314 kcal')).toBeTruthy();
  expect(screen.getByText('Planificado: 100 kcal')).toBeTruthy();
  expect(screen.getByText('Marca')).toBeTruthy();
  expect(screen.getByText('Pan').closest('button')?.parentElement?.className).toContain(
    'border-dashed',
  );
  fireEvent.click(screen.getByText('Pan'));
  expect(onEdit).toHaveBeenCalledWith(entry);
  fireEvent.click(screen.getByText('Ya lo comí'));
  expect(onEat).toHaveBeenCalledWith(entry);
  expect(onEdit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Agregar a Desayuno' }));
  expect(onAdd).toHaveBeenCalledOnce();
});
it('muestra estado vacío', () => {
  render(
    <MealSection
      meal={{ ...meal, entries: [], planned: ZERO_MACROS }}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onEat={vi.fn()}
    />,
  );
  expect(screen.getByText('Sin alimentos')).toBeTruthy();
});
it('impide editar o marcar entradas temporales', () => {
  const edit = vi.fn(),
    eat = vi.fn();
  render(
    <MealSection
      meal={{ ...meal, entries: [{ ...entry, id: 'temp-1' }] }}
      onAdd={vi.fn()}
      onEdit={edit}
      onEat={eat}
    />,
  );
  fireEvent.click(screen.getByText('Pan'));
  fireEvent.click(screen.getByText('Ya lo comí'));
  expect(edit).not.toHaveBeenCalled();
  expect(eat).not.toHaveBeenCalled();
});

it('permite repetir la comida con un botón accesible', () => {
  const onRepeat = vi.fn();
  render(
    <MealSection
      meal={meal}
      onAdd={vi.fn()}
      onRepeat={onRepeat}
      onEdit={vi.fn()}
      onEat={vi.fn()}
    />,
  );
  const repeat = screen.getByRole('button', { name: 'Repetir Desayuno de otro día' });
  expect(repeat.className).toContain('min-h-11');
  fireEvent.click(repeat);
  expect(onRepeat).toHaveBeenCalledOnce();
});
it('muestra el reparto de calorías por macro y resalta los alimentos que aportan el macro elegido', () => {
  const water: Entry = {
    ...entry,
    id: 'water',
    status: 'eaten',
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    food: { ...entry.food, id: 'water', name: 'Agua', brand: null },
  };
  const oil: Entry = {
    ...entry,
    id: 'oil',
    status: 'eaten',
    kcal: 90,
    protein: 0,
    carbs: 0,
    fat: 10,
    food: { ...entry.food, id: 'oil', name: 'Aceite', brand: null },
  };
  const props = { onAdd: vi.fn(), onEdit: vi.fn(), onEat: vi.fn() };
  const section = { ...meal, entries: [entry, water, oil] };
  const { rerender } = render(<MealSection meal={section} {...props} />);
  // Pan: P 5·4 = 20, C 10·4 = 40, G 2,5·9 = 22,5 → 82,5 kcal.
  expect(
    screen.getByRole('img', {
      name: 'Reparto de calorías: Proteína 24 %, Carbohidratos 48 %, Grasa 27 %',
    }),
  ).toBeTruthy();
  expect(screen.getByRole('img', { name: 'Reparto de calorías: Grasa 100 %' })).toBeTruthy();
  expect(screen.getAllByRole('img')).toHaveLength(2);
  rerender(<MealSection meal={section} highlight="protein" {...props} />);
  const row = (name: string) =>
    screen.getByText(name).closest('[data-highlighted], div.min-w-0.border-t');
  expect(row('Pan')?.getAttribute('data-highlighted')).toBe('true');
  expect(screen.getByText('5 g de proteína')).toBeTruthy();
  expect(row('Aceite')?.getAttribute('data-highlighted')).toBeNull();
  expect(row('Aceite')?.className).toContain('opacity-45');
  expect(row('Agua')?.className).toContain('opacity-45');
});
