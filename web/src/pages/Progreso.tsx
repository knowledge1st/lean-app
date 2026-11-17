import { CheckinHistory } from '../features/checkin/CheckinHistory';
import { useCheckins } from '../features/checkin/api';
import { lazy, Suspense, useState } from 'react';
import { isoWeekRange } from '@lean/shared';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { addDays, isoWeek, todayLocal } from '../lib/date';
import { useActiveGoal, useWeekSummary } from '../features/goals/api';
import { useBodyLogs, useProgressEntries } from '../features/progress/api';
import { LogWeightSheet } from '../features/progress/LogWeightSheet';
import { MeasurementsList } from '../features/progress/MeasurementsList';
import { WeightSummary } from '../features/progress/WeightSummary';
const WeightChart = lazy(() => import('../features/progress/WeightChart'));
const WeekBars = lazy(() => import('../features/progress/WeekBars'));
export function Progreso() {
  const today = todayLocal();
  const checkins = useCheckins(52);
  const goalChanges = checkins.isSuccess
    ? checkins.data.checkins
        .filter((c) => c.status === 'adjust' && c.accepted === true && c.resolvedAt)
        .map((c) => todayLocal(new Date(c.resolvedAt!)))
    : [];
  const logs = useBodyLogs(addDays(today, -365), today);
  const goal = useActiveGoal();
  const week = isoWeek(today);
  const range = isoWeekRange(week);
  const summary = useWeekSummary(week);
  const entries = useProgressEntries(range.from, range.to);
  const [open, setOpen] = useState(false);
  const register = <Button onClick={() => setOpen(true)}>Registrar peso</Button>;
  return (
    <section className="min-w-0 space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Progreso</h1>
      {logs.isPending || goal.isPending ? (
        <Skeleton className="h-60!" />
      ) : logs.isError || goal.isError ? (
        <ErrorState
          message="No se pudo cargar tu progreso."
          onRetry={() => {
            void logs.refetch();
            void goal.refetch();
          }}
        />
      ) : (
        <>
          <WeightSummary logs={logs.data.logs} goal={goal.data} today={today} />
          {register}
          {logs.data.logs.some((l) => l.weightKg !== null) ? (
            <Card className="min-w-0">
              <Suspense fallback={<Skeleton className="h-60!" />}>
                <WeightChart
                  logs={logs.data.logs}
                  goal={goal.data}
                  today={today}
                  goalChanges={goalChanges}
                />
              </Suspense>
            </Card>
          ) : (
            <EmptyState
              title="Registrá tu primer peso"
              description="Cargá tu peso para ver la tendencia y cómo avanzás hacia tu objetivo."
              action={register}
            />
          )}
          <Card className="min-w-0 space-y-3">
            <h2 className="text-xl font-semibold">Medidas</h2>
            <MeasurementsList logs={logs.data.logs} />
          </Card>
          {open && (
            <LogWeightSheet
              logs={logs.data.logs}
              today={today}
              open={open}
              onOpenChange={setOpen}
            />
          )}
        </>
      )}
      <Card className="min-w-0 space-y-3">
        <h2 className="text-xl font-semibold">Semana</h2>
        {summary.isPending || entries.isPending ? (
          <Skeleton className="h-60!" />
        ) : summary.isError || entries.isError ? (
          <ErrorState
            message="No se pudo cargar la semana."
            onRetry={() => {
              void summary.refetch();
              void entries.refetch();
            }}
          />
        ) : (
          <Suspense fallback={<Skeleton className="h-60!" />}>
            <WeekBars summary={summary.data} entries={entries.data} />
          </Suspense>
        )}
      </Card>
      <Card>
        <CheckinHistory />
      </Card>
    </section>
  );
}
