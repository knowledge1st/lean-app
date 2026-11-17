// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ZERO_MACROS, type DaySummary } from '@lean/shared';
import { PlanSummary } from './PlanSummary';
const goal = vi.hoisted(() => ({
  data: null as object | null | undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock('../goals/api', () => ({ useActiveGoal: () => goal }));
afterEach(() => {
  cleanup();
  goal.data = null;
  goal.isPending = false;
  goal.isError = false;
  goal.refetch.mockClear();
});
const summary: DaySummary = {
  date: '2026-11-16',
  eaten: { kcal: 600, protein: 50, carbs: 80, fat: 20 },
  planned: { kcal: 500, protein: 40, carbs: 60, fat: 10 },
  target: { kcal: 1000, protein: 100, carbs: 150, fat: 30, waterMl: 2000 },
  meals: [],
  waterMl: 0,
  exerciseKcal: 0,
};
it('suma eaten y planned y calcula faltantes y sobrantes para cada macro', () => {
  render(
    <MemoryRouter>
      <PlanSummary summary={summary} />
    </MemoryRouter>,
  );
  expect(screen.getByText('1.100 / 1.000 kcal')).toBeTruthy();
  expect(screen.getByText('Calorías')).toBeTruthy();
  expect(screen.getByText('Sobran 100 kcal')).toBeTruthy();
  expect(screen.getByText('90 / 100 g')).toBeTruthy();
  expect(screen.getAllByText('Faltan 10 g')).toHaveLength(2);
  expect(screen.getByText('Faltan 0 g')).toBeTruthy();
});
it('sin meta muestra totales y acceso al objetivo', () => {
  render(
    <MemoryRouter>
      <PlanSummary summary={{ ...summary, eaten: ZERO_MACROS, target: null }} />
    </MemoryRouter>,
  );
  expect(screen.getByText('500 kcal')).toBeTruthy();
  expect(screen.queryByText(/Faltan|Sobran/)).toBeNull();
  expect(screen.getByRole('link', { name: 'Definí tu objetivo' }).getAttribute('href')).toBe(
    '/objetivo/nuevo',
  );
});

it('con objetivo activo y sin meta para el día muestra texto atenuado', () => {
  goal.data = { id: 'active' };
  render(
    <MemoryRouter>
      <PlanSummary summary={{ ...summary, target: null }} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link', { name: 'Definí tu objetivo' })).toBeNull();
  expect(screen.getByText('Sin meta para este día').className).toContain('text-muted');
});
it('no invita a definir objetivo mientras se consulta el objetivo activo', () => {
  goal.data = undefined;
  render(
    <MemoryRouter>
      <PlanSummary summary={{ ...summary, target: null }} />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('link', { name: 'Definí tu objetivo' })).toBeNull();
});

it('muestra carga y permite recuperar el objetivo sin ocultar los totales', () => {
  goal.data = undefined;
  goal.isPending = true;
  const view = render(
    <MemoryRouter>
      <PlanSummary summary={{ ...summary, target: null }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('status', { name: 'Cargando objetivo' })).toBeTruthy();
  expect(screen.getByText('1.100 kcal')).toBeTruthy();
  goal.isPending = false;
  goal.isError = true;
  view.rerender(
    <MemoryRouter>
      <PlanSummary summary={{ ...summary, target: null }} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el objetivo');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(goal.refetch).toHaveBeenCalledOnce();
});
