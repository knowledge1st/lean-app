// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MacroBars } from './MacroBars';
afterEach(cleanup);
const eaten = { kcal: 500, protein: 30, carbs: 50, fat: 20 };
it('alterna la selección de un macro y lo marca como presionado', () => {
  const onSelect = vi.fn();
  const { rerender } = render(<MacroBars eaten={eaten} target={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole('button', { name: /Proteína/ }));
  expect(onSelect).toHaveBeenLastCalledWith('protein');
  rerender(<MacroBars eaten={eaten} target={null} selected="protein" onSelect={onSelect} />);
  expect(screen.getByRole('button', { name: /Proteína/ }).getAttribute('aria-pressed')).toBe(
    'true',
  );
  expect(screen.getByRole('button', { name: /Grasa/ }).getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: /Proteína/ }));
  expect(onSelect).toHaveBeenLastCalledWith(null);
});
it('sin onSelect no es interactivo', () => {
  render(<MacroBars eaten={eaten} target={null} />);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
