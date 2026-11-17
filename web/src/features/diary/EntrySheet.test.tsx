// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Entry } from '@lean/shared';
import { EntrySheet } from './EntrySheet';
import { EntryRow } from './EntryRow';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const entry: Entry = {
  id: 'entry',
  date: '2026-11-14',
  meal: 'breakfast',
  status: 'eaten',
  foodId: 'food',
  grams: 1234.5,
  kcal: 1234,
  protein: 0,
  carbs: 0,
  fat: 0,
  food: {
    id: 'food',
    source: 'seed',
    name: 'Pan integral',
    brand: 'Panadería',
    servingG: 12.5,
    servingLabel: 'Una rebanada de pan integral',
  },
  createdAt: '2026-11-14T12:00:00Z',
};
it.each(['eaten', 'planned'] as const)('confirma y permite cancelar el borrado de %s', (status) => {
  const onDelete = vi.fn();
  const onSave = vi.fn();
  render(
    <EntrySheet
      entry={{ ...entry, status }}
      onClose={vi.fn()}
      onSave={onSave}
      onDelete={onDelete}
    />,
  );
  expect((screen.getByLabelText('Gramos') as HTMLInputElement).value).toBe('1234,5');
  expect(screen.getByText(entry.food.brand!).closest('.break-words')).toBeTruthy();
  expect(screen.getByText(entry.food.servingLabel!)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
  expect(onDelete).not.toHaveBeenCalled();
  const confirmation = screen.getByRole('group', { name: '¿Borrar Pan integral?' });
  expect(confirmation.contains(screen.getByRole('button', { name: 'Cancelar' }))).toBe(true);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByText('¿Borrar Pan integral?')).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Borrar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }));
  expect(onDelete).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});
it.each(['12.5', '12,5'])('guarda gramos ingresados con %s', (value) => {
  const onSave = vi.fn();
  render(<EntrySheet entry={entry} onClose={vi.fn()} onSave={onSave} onDelete={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Gramos'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(onSave).toHaveBeenCalledWith({ grams: 12.5 });
});
it.each([true, false])('respeta movimiento reducido %s en entradas temporales', (matches) => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scroll,
  });
  const { container } = render(
    <EntryRow
      entry={{ ...entry, id: 'temp-1', status: 'planned' }}
      onEdit={vi.fn()}
      onEat={vi.fn()}
    />,
  );
  expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: matches ? 'auto' : 'smooth' });
  expect(container.firstElementChild?.className).toContain('border-dashed');
  expect(container.firstElementChild?.className).not.toContain('opacity');
  expect(screen.getByText('1.234 kcal')).toBeTruthy();
  expect(screen.getByTitle(entry.food.name).className).toContain('line-clamp-2');
  expect(screen.getByTitle(entry.food.brand!).className).toContain('line-clamp-2');
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
