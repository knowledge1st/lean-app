import type { DaySummary } from '@lean/shared';
import { useActiveGoal } from '../goals/api';
import { Link } from 'react-router';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { Card } from '../../components/ui/Card';
import { MACROS, formatNumber } from '../../lib/macros';
export function PlanSummary({ summary }: { summary: DaySummary }) {
  const goal = useActiveGoal();
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Total del día</h2>
      {[{ key: 'kcal' as const, label: 'Calorías' }, ...MACROS].map(({ key, label }) => {
        const total = summary.eaten[key] + summary.planned[key];
        const target = summary.target?.[key];
        const unit = key === 'kcal' ? 'kcal' : 'g';
        return (
          <div key={key} className="flex flex-wrap justify-between gap-2">
            <span>{label}</span>
            <span>
              {formatNumber(total)}
              {target != null ? ` / ${formatNumber(target)}` : ''} {unit}
              {target != null && (
                <span className="block text-sm text-muted">
                  {total > target ? 'Sobran' : 'Faltan'} {formatNumber(Math.abs(target - total))}{' '}
                  {unit}
                </span>
              )}
            </span>
          </div>
        );
      })}
      {!summary.target && goal.isPending && (
        <div role="status" aria-label="Cargando objetivo">
          <Skeleton />
        </div>
      )}
      {!summary.target && goal.isError && (
        <ErrorState
          message="No se pudo cargar el objetivo"
          onRetry={() => {
            void goal.refetch();
          }}
        />
      )}
      {!summary.target && !goal.isPending && !goal.isError && goal.data === null && (
        <Link className="inline-flex min-h-11 items-center text-accent" to="/objetivo/nuevo">
          Definí tu objetivo
        </Link>
      )}
      {!summary.target && !goal.isPending && !goal.isError && goal.data != null && (
        <p className="text-muted">Sin meta para este día</p>
      )}
    </Card>
  );
}
