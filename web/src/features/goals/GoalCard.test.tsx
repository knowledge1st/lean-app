// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ActiveGoal } from '@lean/shared';
import { activeGoalKey } from './api';
import { api } from '../../lib/api';
import { GoalCard } from './GoalCard';
import { DRAFT_KEY, emptyDraft, storeDraft } from './draft';

const goal: ActiveGoal = {
  id: 'goal-1',
  mode: 'weight_date',
  preset: null,
  startDate: '2026-01-01',
  startWeightKg: 80,
  targetWeightKg: 72,
  targetDate: '2026-03-12',
  progress: { startWeightKg: 80, currentWeightKg: 76, targetWeightKg: 72, percent: 50 },
  target: { kcal: 2000, protein: 140, carbs: 220, fat: 62, waterMl: 2500 },
  milestones: [
    { date: '2026-03-12', expectedWeightKg: 72, kind: 'final' },
    { date: '2026-01-31', expectedWeightKg: 78, kind: 'month' },
    { date: '2026-02-01', expectedWeightKg: 77, kind: 'week' },
    { date: '2026-02-28', expectedWeightKg: 74, kind: 'month' },
    { date: '2026-01-01', expectedWeightKg: 80, kind: 'month' },
    { date: '2026-04-30', expectedWeightKg: 72, kind: 'month' },
  ],
};
function setup(data: ActiveGoal | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(activeGoalKey, data);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/perfil']}>
        <Routes>
          <Route path="/perfil" element={<GoalCard />} />
          <Route path="/objetivo/nuevo" element={<p>Asistente de objetivo</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('muestra peso, avance, meta diaria y los tres próximos hitos mensuales o finales ordenados', () => {
  vi.setSystemTime(new Date('2026-01-31T12:00:00Z'));
  setup(goal);
  expect(screen.getByText('Llegar a 72 kg el 12 de marzo')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  const list = screen.getByRole('list');
  expect(
    within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['31 de enero78 kg', '28 de febrero74 kg', '12 de marzo72 kg']);
  expect(screen.getByText('80 kg')).toBeTruthy();
  expect(screen.getByText('76 kg')).toBeTruthy();
  expect(screen.getByText('2.000 kcal')).toBeTruthy();
  for (const label of ['Calorías', 'Proteína', 'Carbohidratos', 'Grasa'])
    expect(screen.getByText(label)).toBeTruthy();
  for (const value of ['140 g', '220 g', '62 g', '2.500 ml'])
    expect(screen.getByText(value)).toBeTruthy();
  vi.useRealTimers();
});

it.each([
  ['cut', 'Definición'],
  ['recomp', 'Recomposición'],
  ['lean_bulk', 'Volumen limpio'],
] as const)(
  'muestra composición %s sin meta de peso ni barra cuando no hay porcentaje',
  (preset, label) => {
    setup({
      ...goal,
      mode: 'composition',
      preset,
      targetWeightKg: null,
      targetDate: null,
      milestones: [],
      progress: { ...goal.progress, targetWeightKg: null, percent: null },
    });
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('80 kg')).toBeTruthy();
    expect(screen.getByText('76 kg')).toBeTruthy();
    expect(screen.queryByText('Meta')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  },
);

it('muestra un objetivo manual sin meta de peso', () => {
  setup({
    ...goal,
    mode: 'manual',
    targetWeightKg: null,
    targetDate: null,
    milestones: [],
    progress: { ...goal.progress, targetWeightKg: null, percent: null },
  });
  expect(screen.getByText('Mis números')).toBeTruthy();
  expect(screen.queryByText('Meta')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it.each([true, false])('abre el asistente y limpia el borrador (objetivo activo: %s)', (active) => {
  storeDraft({ ...emptyDraft, heightCm: '190' });
  setup(active ? goal : null);
  if (!active) expect(screen.getByText('Todavía no definiste tu objetivo')).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: active ? 'Cambiar objetivo' : 'Definir mi objetivo' }),
  );
  expect(screen.getByText('Asistente de objetivo')).toBeTruthy();
  expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
});

it('muestra carga, error y permite reintentar', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(null);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GoalCard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByRole('status', { name: 'Cargando tu objetivo' })).toBeTruthy();
  expect(await screen.findByText('No se pudo cargar tu objetivo.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Todavía no definiste tu objetivo')).toBeTruthy();
  expect(get).toHaveBeenCalledTimes(2);
});

it('edita las calorías objetivo con vista previa de macros y guarda la meta nueva', async () => {
  setup(goal);
  const put = vi.spyOn(api, 'put').mockResolvedValue({
    ...goal,
    target: { ...goal.target, kcal: 1800, carbs: 170.5 },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Editar calorías objetivo' }));
  const dialog = screen.getByRole('dialog', { name: 'Calorías objetivo' });
  const input = within(dialog).getByLabelText('Calorías diarias');
  fireEvent.change(input, { target: { value: '400' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  expect(within(dialog).getByText('Mínimo 500 kcal')).toBeTruthy();
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: '1800' } });
  // P 140 y G 62 se mantienen: C = (1800 − 560 − 558)/4 = 170,5.
  expect(within(dialog).getByText('170,5 g')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/api/goals/active/target', { kcal: 1800 }));
  expect(await screen.findByText('1.800 kcal')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
