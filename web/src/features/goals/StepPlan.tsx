import type { PlanResponse, Sex } from '@lean/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { formatGoalDate, formatNumber, weeklyChange } from './format';
import { planWarningMessages } from './warnings';
export function StepPlan({
  plan,
  sex,
  today,
  requestedDate,
  onEdit,
}: {
  plan: PlanResponse;
  sex: Sex;
  today: string;
  requestedDate?: string | undefined;
  onEdit: (step: number) => void;
}) {
  const finalDate =
    plan.milestones.find((point) => point.kind === 'final')?.date ??
    plan.adjusted?.targetDate ??
    requestedDate;
  const unreachable = plan.warnings.some(({ code }) => code === 'date_unreachable');
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Tu meta diaria</h2>
        <dl className="grid grid-cols-2 gap-3">
          {[
            ['Calorías', `${formatNumber(plan.daily.kcal)} kcal`],
            ['Proteína', `${formatNumber(plan.daily.proteinG)} g`],
            ['Carbohidratos', `${formatNumber(plan.daily.carbsG)} g`],
            ['Grasa', `${formatNumber(plan.daily.fatG)} g`],
            ['Agua', `${formatNumber(plan.daily.waterMl)} ml`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <h2 className="font-semibold">Tu semana</h2>
        <p>Presupuesto semanal: {formatNumber(plan.weekly.kcalBudget)} kcal</p>
        {plan.weekly.expectedWeightChangeKg !== null && (
          <p>{weeklyChange(plan.weekly.expectedWeightChangeKg)}</p>
        )}
        {plan.tdee !== null && <p>Gasto diario estimado: {formatNumber(plan.tdee)} kcal</p>}
      </Card>
      {!unreachable && finalDate && <p>Fecha estimada: {formatGoalDate(finalDate, today)}</p>}
      {plan.milestones.some((point) => point.kind !== 'week') && (
        <Card>
          <h2 className="mb-3 font-semibold">Tus metas mensuales</h2>
          <ul className="space-y-2">
            {plan.milestones
              .filter((point) => point.kind === 'month' || point.kind === 'final')
              .map((point) => (
                <li key={`${point.kind}-${point.date}`}>
                  {formatGoalDate(point.date, today)}: {formatNumber(point.expectedWeightKg)} kg
                </li>
              ))}
          </ul>
        </Card>
      )}
      <div className="space-y-3 text-warning">
        {planWarningMessages(plan, { sex, today }).map((message) => (
          <p key={message}>{message}</p>
        ))}
      </div>
      {unreachable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onEdit(2)}>
            Cambiar objetivo
          </Button>
          <Button variant="secondary" onClick={() => onEdit(3)}>
            Cambiar detalle
          </Button>
        </div>
      )}
    </div>
  );
}
