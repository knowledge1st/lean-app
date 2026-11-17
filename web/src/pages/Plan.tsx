import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { isoWeekOf, isoWeekRange, isoWeekSchema } from '@lean/shared';
import { addDays, todayLocal, parseLocalDateParam, formatDayLabel } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { useDaySummary } from '../features/diary/api';
import { WeekStrip } from '../features/plan/WeekStrip';
import { PlanSummary } from '../features/plan/PlanSummary';
import { DayPlan } from '../features/plan/DayPlan';
import { PlanActions } from '../features/plan/PlanActions';
export function Plan() {
  const [params, setParams] = useSearchParams();
  const today = todayLocal();
  const parsedWeek = isoWeekSchema.safeParse(params.get('semana'));
  const week = parsedWeek.success ? parsedWeek.data : isoWeekOf(today);
  const { from, to } = isoWeekRange(week);
  const requestedDate = parseLocalDateParam(params.get('dia'));
  const date =
    requestedDate && requestedDate >= from && requestedDate <= to
      ? requestedDate
      : today >= from && today <= to
        ? today
        : from;
  const query = useDaySummary(date);
  useEffect(() => {
    if (params.get('semana') === week && params.get('dia') === date) return;
    const next = new URLSearchParams(params);
    next.set('semana', week);
    next.set('dia', date);
    setParams(next, { replace: true });
  }, [params, setParams, week, date]);
  function select(nextWeek: string, nextDate: string) {
    const next = new URLSearchParams(params);
    next.set('semana', nextWeek);
    next.set('dia', nextDate);
    setParams(next, { replace: true });
  }
  const dateFormat = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return (
    <section className="min-w-0 space-y-5">
      <header className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          aria-label="Semana anterior"
          disabled={
            !parseLocalDateParam(addDays(from, -7)) ||
            !isoWeekSchema.safeParse(isoWeekOf(addDays(from, -7))).success
          }
          onClick={() => {
            const monday = addDays(from, -7);
            select(isoWeekOf(monday), monday);
          }}
        >
          ←
        </Button>
        <h1 className="text-center text-2xl font-bold">
          <span className="block">Plan</span>
          <span className="text-base">
            {dateFormat.formatRange(new Date(`${from}T12:00:00Z`), new Date(`${to}T12:00:00Z`))}
          </span>
        </h1>
        <Button
          variant="ghost"
          aria-label="Semana siguiente"
          disabled={
            !parseLocalDateParam(addDays(from, 7)) ||
            !isoWeekSchema.safeParse(isoWeekOf(addDays(from, 7))).success
          }
          onClick={() => {
            const monday = addDays(from, 7);
            select(isoWeekOf(monday), monday);
          }}
        >
          →
        </Button>
      </header>
      <WeekStrip
        dates={Array.from({ length: 7 }, (_, i) => addDays(from, i))}
        selected={date}
        onSelect={(nextDate) => select(week, nextDate)}
      />
      <h2 className="text-xl font-semibold">{formatDayLabel(date, today)}</h2>
      {query.isPending ? (
        <div aria-label="Cargando día" className="space-y-4">
          <Skeleton className="h-64" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          {query.isError && (
            <ErrorState
              message={query.error.message}
              onRetry={() => {
                void query.refetch();
              }}
            />
          )}
          {query.data && (
            <>
              <PlanSummary summary={query.data} />
              <PlanActions key={`${week}-${date}`} week={week} summary={query.data} />
              <DayPlan key={date} summary={query.data} />
            </>
          )}
        </>
      )}
    </section>
  );
}
