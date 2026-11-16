import { buildPlan, limitAdjustedTargetDate, maxGoalTargetDate } from '@lean/shared';
import { addDays } from '../../lib/date';
import { Choices, Field, StepContent, type StepProps } from './fields';
import { goalBody, profileInput, validateStep, numeric } from './draft';
import { formatNumber, weeklyChange } from './format';
import { planWarningMessages } from './warnings';
export function StepDetail(props: StepProps & { today: string }) {
  const { draft, today } = props;
  const valid =
    !Object.keys(validateStep(draft, 1, today)).length &&
    !Object.keys(validateStep(draft, 3, today)).length;
  const profile = valid ? profileInput(draft) : null;
  const body = valid ? goalBody(draft) : null;
  const plan =
    profile && body
      ? limitAdjustedTargetDate(
          buildPlan(
            { ...profile, activity: profile.activityLevel },
            {
              weightKg: body.weightKg,
              ...(body.bodyFatPct !== undefined ? { bodyFatPct: body.bodyFatPct } : {}),
            },
            body.goal,
            today,
          ),
          today,
        )
      : null;
  const unreachable = plan?.warnings.some(({ code }) => code === 'date_unreachable');
  const macrosKcal =
    numeric(draft.proteinG) * 4 + numeric(draft.carbsG) * 4 + numeric(draft.fatG) * 9;
  return (
    <StepContent>
      {draft.mode === 'weight_date' && (
        <>
          <Field {...props} name="targetWeightKg" label="Peso objetivo" unit="kg" />
          <Field
            {...props}
            name="targetDate"
            label="Fecha objetivo"
            type="date"
            min={addDays(today, 1)}
            max={maxGoalTargetDate(today)}
          />
          {!unreachable && plan?.weekly.expectedWeightChangeKg != null && (
            <p aria-live="polite">{weeklyChange(plan.weekly.expectedWeightChangeKg)}</p>
          )}
        </>
      )}
      {draft.mode === 'composition' && (
        <Choices
          {...props}
          name="preset"
          legend="Cómo querés cambiar"
          options={[
            ['cut', 'Definición', 'Bajar grasa conservando músculo.'],
            [
              'recomp',
              'Recomposición',
              'Comer apenas por debajo de lo que gastás y entrenar para ganar músculo y perder grasa de a poco.',
            ],
            [
              'lean_bulk',
              'Volumen limpio',
              'Comer un poco más de lo que gastás para ganar músculo con poca grasa.',
            ],
          ]}
        />
      )}
      {draft.mode === 'manual' && (
        <>
          <Field {...props} name="kcal" label="Calorías diarias" unit="kcal" />
          <Field {...props} name="proteinG" label="Proteína" unit="g" />
          <Field {...props} name="carbsG" label="Carbohidratos" unit="g" />
          <Field {...props} name="fatG" label="Grasa" unit="g" />
          <p aria-live="polite">
            Tus macros suman {Number.isFinite(macrosKcal) ? formatNumber(macrosKcal) : '—'} kcal de{' '}
            {Number.isFinite(numeric(draft.kcal)) ? formatNumber(numeric(draft.kcal)) : '—'} kcal
            diarias (4 por g de proteína y carbos, 9 por g de grasa).
          </p>
        </>
      )}
      {plan && profile && (
        <div aria-live="polite" className="space-y-3 text-warning">
          {planWarningMessages(plan, { sex: profile.sex, today }).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </StepContent>
  );
}
