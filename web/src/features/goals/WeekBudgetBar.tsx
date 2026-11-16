import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { isoWeek } from '../../lib/date';
import { useWeekSummary } from './api';
import { formatNumber } from './format';

export function WeekBudgetBar({ date }: { date: string }) {
  const query = useWeekSummary(isoWeek(date));
  if (query.isPending) {
    return <Skeleton className="h-2!" aria-label="Cargando presupuesto semanal" />;
  }
  if (query.isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <p>No se pudo cargar el presupuesto semanal.</p>
        <Button
          variant="ghost"
          onClick={() => {
            void query.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  }
  const { budgetKcal, eatenKcal, remainingKcal } = query.data;
  if (budgetKcal === null) return null;
  const remaining = remainingKcal ?? budgetKcal - eatenKcal;
  const percent = budgetKcal > 0 ? Math.min(Math.max(eatenKcal / budgetKcal, 0), 1) * 100 : 0;
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm text-muted">
        {remaining < 0
          ? `Te pasaste ${formatNumber(Math.abs(remaining))} kcal esta semana`
          : `Te quedan ${formatNumber(remaining)} kcal esta semana`}
      </p>
      <div
        role="progressbar"
        aria-label="Presupuesto semanal consumido"
        aria-valuemin={0}
        aria-valuemax={budgetKcal}
        aria-valuenow={Math.min(Math.max(eatenKcal, 0), budgetKcal)}
        aria-valuetext={`${formatNumber(eatenKcal)} de ${formatNumber(budgetKcal)} kcal`}
        className="h-2 overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full ${remaining < 0 ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
