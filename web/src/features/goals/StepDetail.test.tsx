// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { buildPlan, limitAdjustedTargetDate } from '@lean/shared';
import { StepPlan } from './StepPlan';
import { StepDetail } from './StepDetail';
import { emptyDraft } from './draft';
import { formatGoalDate } from './format';
afterEach(cleanup);
it('calcula el ritmo y la fecha ajustada con el motor compartido', () => {
  const today = '2026-11-16';
  const draft = {
    ...emptyDraft,
    sex: 'male',
    birthDate: '1990-01-01',
    heightCm: '180',
    weightKg: '100',
    activityLevel: 'moderate',
    mode: 'weight_date',
    targetWeightKg: '90',
    targetDate: '2026-11-17',
  };
  const expected = limitAdjustedTargetDate(
    buildPlan(
      { sex: 'male', birthDate: draft.birthDate, heightCm: 180, activity: 'moderate' },
      { weightKg: 100 },
      { mode: 'weight_date', targetWeightKg: 90, targetDate: draft.targetDate },
      today,
    ),
    today,
  );
  render(<StepDetail draft={draft} errors={{}} change={() => {}} today={today} />);
  expect(screen.getByText('Vas a bajar unos 1 kg por semana.')).toBeTruthy();
  expect(
    screen.getByText(
      `Con un ritmo saludable llegás el ${formatGoalDate(expected.adjusted!.targetDate, today)}. El plan ya usa esa fecha.`,
    ),
  ).toBeTruthy();
  expect((screen.getByLabelText('Fecha objetivo') as HTMLInputElement).max).toBe('2031-11-16');
});
it('muestra la suma 4/4/9 y el aviso cuando difiere más del 10 %', () => {
  render(
    <StepDetail
      draft={{
        ...emptyDraft,
        sex: 'female',
        birthDate: '1990-01-01',
        heightCm: '165',
        weightKg: '70',
        activityLevel: 'light',
        mode: 'manual',
        kcal: '2000',
        proteinG: '100',
        carbsG: '100',
        fatG: '50',
      }}
      errors={{}}
      change={() => {}}
      today="2026-11-16"
    />,
  );
  expect(screen.getByText(/Tus macros suman 1.250 kcal de 2.000/)).toBeTruthy();
  expect(
    screen.getByText('Las calorías de tus macros no coinciden con las kcal que pusiste.'),
  ).toBeTruthy();
});

it.each(['floor', 'multiple'] as const)(
  'muestra la fecha ajustada una sola vez en ambos pasos: %s',
  (warnings) => {
    const today = '2026-11-16';
    const draft = {
      ...emptyDraft,
      sex: 'female',
      birthDate: '1990-01-01',
      heightCm: '165',
      weightKg: '70',
      activityLevel: 'sedentary',
      mode: 'weight_date',
      targetWeightKg: '65',
      targetDate: warnings === 'floor' ? '2027-01-15' : '2026-11-17',
    };
    const expected = limitAdjustedTargetDate(
      buildPlan(
        { sex: 'female', birthDate: draft.birthDate, heightCm: 165, activity: 'sedentary' },
        { weightKg: 70 },
        { mode: 'weight_date', targetWeightKg: 65, targetDate: draft.targetDate },
        today,
      ),
      today,
    );
    if (warnings === 'floor') {
      expect(expected.warnings).toEqual([{ code: 'floor_applied' }]);
      expect(expected.adjusted?.targetDate).toBe('2027-02-07');
    }
    const view = render(<StepDetail draft={draft} errors={{}} change={() => {}} today={today} />);
    expect(
      screen.getAllByText(/Con un ritmo saludable llegás el .* El plan ya usa esa fecha\./),
    ).toHaveLength(1);
    view.unmount();
    render(
      <StepPlan
        plan={{
          ...expected,
          warnings:
            warnings === 'floor'
              ? expected.warnings
              : [{ code: 'rate_capped' }, { code: 'date_in_past' }, { code: 'floor_applied' }],
        }}
        sex="female"
        today={today}
        onEdit={() => {}}
      />,
    );
    expect(
      screen.getAllByText(/Con un ritmo saludable llegás el .* El plan ya usa esa fecha\./),
    ).toHaveLength(1);
    expect(
      screen.getByRole('status').compareDocumentPosition(screen.getByText('Tu meta diaria')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  },
);

it('oculta ritmo y fechas en ambos pasos si el gasto no permite bajar', () => {
  const today = '2026-11-16';
  const draft = {
    ...emptyDraft,
    sex: 'female',
    birthDate: '1990-01-01',
    heightCm: '140',
    weightKg: '45',
    activityLevel: 'sedentary',
    mode: 'weight_date',
    targetWeightKg: '42',
    targetDate: '2027-03-01',
  };
  const plan = buildPlan(
    { sex: 'female', birthDate: draft.birthDate, heightCm: 140, activity: 'sedentary' },
    { weightKg: 45 },
    { mode: 'weight_date', targetWeightKg: 42, targetDate: draft.targetDate },
    today,
  );
  expect(plan.warnings).toContainEqual({ code: 'date_unreachable' });
  const view = render(<StepDetail draft={draft} errors={{}} change={() => {}} today={today} />);
  expect(screen.getByText(/Con tu gasto diario no es posible/)).toBeTruthy();
  expect(screen.queryByText(/Vas a/)).toBeNull();
  view.unmount();
  const onEdit = vi.fn();
  render(
    <StepPlan
      plan={plan}
      sex="female"
      today={today}
      requestedDate={draft.targetDate}
      onEdit={onEdit}
    />,
  );
  expect(screen.queryByText(/Vas a|Fecha estimada/)).toBeNull();
  const warning = screen.getByRole('status');
  expect(
    warning.compareDocumentPosition(screen.getByText('Tu meta diaria')) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar objetivo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar detalle' }));
  expect(onEdit.mock.calls).toEqual([[2], [3]]);
});
