import { useDaySummary } from '../diary/api';
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
        aria-label={`${dayLabel} · ${formatNumber(total, 0)} kcal${indicator ? ` · ${indicator.label.toLowerCase()}` : ''}${date === today ? ' · hoy' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(date)}
        className={`min-h-11 w-full min-w-0 rounded-xl border py-2 text-center ${selected ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface'}`}
      >
        <span className="block text-xs">
          {initial}
          {date === today && <span aria-hidden="true"> •</span>}
        </span>
        <span className="block font-semibold">{Number(date.slice(-2))}</span>
        <span className="block text-[11px] tabular-nums">{formatNumber(total, 0)}</span>
        {indicator && (
          <span
            aria-label={indicator.label}
            className={`mx-auto block w-5 rounded-full bg-surface ${indicator.color}`}
          >
            {indicator.symbol}
          </span>
        )}
      </button>
      {query.isPending && <Skeleton className="mt-1 h-1" />}
      {query.isError && (
        <ErrorState
          className="mt-1 p-1 text-xs [&_button]:min-w-0 [&_button]:w-full [&_button]:px-0 [&_button]:text-[9px]"
          message="Error"
          onRetry={() => {
            void query.refetch();
          }}
        />
      )}
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
  return (
    <nav aria-label="Días de la semana, totales en kcal" className="grid min-w-0 grid-cols-7 gap-1">
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
  );
}
