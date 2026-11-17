import { useQueries } from '@tanstack/react-query';
import { daySummaryQueryFn, summaryKey, useDaySummary } from '../diary/api';
import { todayLocal } from '../../lib/date';
import { formatNumber } from '../../lib/macros';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { kcalStatus } from './api';
const indicators = {
  on: { label: 'Dentro de la meta', symbol: '✓', color: 'text-success' },
  near: { label: 'Cerca de la meta', symbol: '≈', color: 'text-warning' },
  off: { label: 'Lejos de la meta', symbol: '!', color: 'text-danger' },
};
function WeekDay({
  date,
  initial,
  selected,
  onSelect,
}: {
  date: string;
  initial: string;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const query = useDaySummary(date);
  const total = query.data ? query.data.eaten.kcal + query.data.planned.kcal : 0;
  const hasEntries = query.data?.meals.some((meal) => meal.entries.length > 0);
  const status = hasEntries ? kcalStatus(total, query.data?.target?.kcal) : null;
  const indicator = status ? indicators[status] : null;
  const today = todayLocal();
  const dayLabel = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-label={`${dayLabel} · ${query.data ? `${formatNumber(total, 0)} kcal` : query.isPending ? 'cargando' : 'sin datos'}${indicator ? ` · ${indicator.label.toLowerCase()}` : ''}${date === today ? ' · hoy' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(date)}
        className={`min-h-11 w-full min-w-0 rounded-xl border py-2 text-center ${selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface'}`}
      >
        <span className="block text-xs">
          {initial}
          {date === today && <span aria-hidden="true"> •</span>}
        </span>
        <span className="block font-semibold">{formatNumber(Number(date.slice(-2)), 0)}</span>
        {!query.data && query.isPending ? (
          <Skeleton className="mx-auto h-8 w-8" />
        ) : (
          <span className="block text-[11px] tabular-nums">
            {query.data ? formatNumber(total, 0) : '—'}
            <span className="block">{query.data ? 'kcal' : '\u00a0'}</span>
          </span>
        )}
        {indicator ? (
          <span
            aria-label={indicator.label}
            className={`mx-auto block h-6 w-5 rounded-full bg-surface ${indicator.color}`}
          >
            {indicator.symbol}
          </span>
        ) : (
          <span aria-hidden="true" className="block h-6" />
        )}
      </button>
    </div>
  );
}
export function WeekStrip({
  dates,
  selected,
  onSelect,
}: {
  dates: string[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const queries = useQueries({
    queries: dates.map((date) => ({
      queryKey: summaryKey(date),
      queryFn: daySummaryQueryFn,
      enabled: false,
    })),
  });
  const failed = queries.filter((query) => query.isError);
  return (
    <div className="space-y-3">
      <nav
        aria-label="Días de la semana, totales en kcal"
        className="grid min-w-0 grid-cols-7 gap-1 [&_button]:min-w-11"
      >
        {dates.map((date, index) => (
          <WeekDay
            key={date}
            date={date}
            initial={['L', 'M', 'M', 'J', 'V', 'S', 'D'][index]!}
            selected={date === selected}
            onSelect={onSelect}
          />
        ))}
      </nav>
      {failed.length > 0 && (
        <ErrorState
          message="No se pudieron cargar algunos días"
          onRetry={() => {
            void Promise.all(failed.map((query) => query.refetch()));
          }}
        />
      )}
    </div>
  );
}
