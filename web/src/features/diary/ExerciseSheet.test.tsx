// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExerciseSheet } from './ExerciseSheet';
import { api } from '../../lib/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('valida campos obligatorios, enteros y límites en español con teclado numérico', () => {
  const post = vi.spyOn(api, 'post');
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ExerciseSheet date="2026-11-14" onClose={vi.fn()} />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText('Minutos').getAttribute('inputmode')).toBe('numeric');
  expect(screen.getByLabelText('Calorías (opcional)').getAttribute('inputmode')).toBe('numeric');
  fireEvent.click(screen.getByText('Guardar'));
  expect(screen.getByText('Indicá una actividad')).toBeTruthy();
  expect(screen.getByText('Minutos: indicá un número finito')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'a'.repeat(101) } });
  fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '30.5' } });
  fireEvent.change(screen.getByLabelText('Calorías (opcional)'), { target: { value: '3001' } });
  expect(screen.getByText('La actividad no puede superar 100 caracteres')).toBeTruthy();
  expect(screen.getByText('Indicá minutos enteros')).toBeTruthy();
  expect(screen.getByText('Calorías: máximo 3000')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Minutos'), { target: { value: '601' } });
  expect(screen.getByText('Minutos: máximo 600')).toBeTruthy();
  fireEvent.click(screen.getByText('Guardar'));
  expect(post).not.toHaveBeenCalled();
  client.clear();
});
