import { useNavigate } from 'react-router';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { MACROS } from '../../lib/macros';
import { todayLocal } from '../../lib/date';
import { useActiveGoal } from './api';
import { clearDraft } from './draft';
import { formatGoalDate, formatNumber } from './format';

const presetLabels = { cut: 'Definición', recomp: 'Recomposición', lean_bulk: 'Volumen limpio' };

export function GoalCard() {
  const query = useActiveGoal();
  const navigate = useNavigate();
  const today = todayLocal();
  const goal = query.data;
  function startWizard() {
    clearDraft();
    navigate('/objetivo/nuevo');
  }
  const milestones = goal?.milestones
    .filter(({ kind, date }) => (kind === 'month' || kind === 'final') && date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  return (
    <Card className="min-w-0 space-y-5">
      <h2 className="text-xl font-semibold">Mi objetivo</h2>
      {query.isPending ? (
        <div role="status" aria-label="Cargando tu objetivo" className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message="No se pudo cargar tu objetivo." onRetry={() => void query.refetch()} />
      ) : !goal ? (
        <>
          <p>Todavía no definiste tu objetivo</p>
          <p className="text-muted">Armá tu plan para ver tus metas y seguir tu avance.</p>
          <Button className="w-full" onClick={startWizard}>
            Definir mi objetivo
          </Button>
        </>
      ) : (
        <>
          <p className="font-medium">
            {goal.mode === 'weight_date' && goal.targetWeightKg !== null && goal.targetDate
              ? `Llegar a ${formatNumber(goal.targetWeightKg)} kg el ${formatGoalDate(goal.targetDate, today)}`
              : goal.mode === 'composition' && goal.preset
                ? presetLabels[goal.preset]
                : 'Mis números'}
          </p>
          <div className="space-y-3">
            <dl className="grid grid-cols-3 gap-2">
              {[
                ['Inicio', goal.progress.startWeightKg] as const,
                ['Actual', goal.progress.currentWeightKg] as const,
                ...(goal.mode === 'weight_date' && goal.progress.targetWeightKg !== null
                  ? [['Meta', goal.progress.targetWeightKg] as const]
                  : []),
              ].map(([label, weight]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="font-medium">{formatNumber(weight)} kg</dd>
                </div>
              ))}
            </dl>
            {goal.progress.percent !== null && (
              <div
                role="progressbar"
                aria-label="Avance del objetivo"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={goal.progress.percent}
                className="h-2 overflow-hidden rounded-full bg-border"
              >
                <div className="h-full bg-accent" style={{ width: `${goal.progress.percent}%` }} />
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">Meta diaria vigente</h3>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['Calorías', `${formatNumber(goal.target.kcal)} kcal`],
                ...MACROS.map(({ key, label }) => [label, `${formatNumber(goal.target[key])} g`]),
                ['Agua', `${formatNumber(goal.target.waterMl)} ml`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {!!milestones?.length && (
            <div className="space-y-3">
              <h3 className="font-semibold">Próximos hitos</h3>
              <ul className="space-y-2">
                {milestones.map((milestone) => (
                  <li
                    key={`${milestone.date}-${milestone.kind}`}
                    className="flex flex-wrap justify-between gap-x-3"
                  >
                    <span>{formatGoalDate(milestone.date, today)}</span>
                    <span>{formatNumber(milestone.expectedWeightKg)} kg</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="secondary" className="w-full" onClick={startWizard}>
            Cambiar objetivo
          </Button>
        </>
      )}
    </Card>
  );
}
