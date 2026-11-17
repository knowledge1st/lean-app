import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatWeekRange } from '../../lib/date';
import { useCheckins } from './api';
import { checkinDecisionLabel, checkinStatusLabel, formatKcal } from './messages';

export function CheckinHistory() {
  const query = useCheckins(52);
  return (
    <section className="space-y-3" aria-labelledby="checkin-history-title">
      <h2 id="checkin-history-title" className="text-xl font-semibold">
        Revisiones semanales
      </h2>
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.isError ? (
        <ErrorState
          message="No se pudieron cargar las revisiones."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : query.data.checkins.length === 0 ? (
        <p>Todavía no hay revisiones. La primera aparece después de tu primera semana completa.</p>
      ) : (
        <ul className="divide-y divide-border">
          {query.data.checkins.slice(0, 10).map((c) => (
            <li key={c.id} className="space-y-1 py-3">
              <p className="font-semibold">{formatWeekRange(c.weekStart, c.weekEnd)}</p>
              <p>
                {checkinStatusLabel(c)}
                {c.status === 'adjust' &&
                  c.proposed &&
                  `: de ${formatKcal(c.current.kcal)} a ${formatKcal(c.proposed.kcal)} kcal`}
              </p>
              <p className="text-sm text-muted">{checkinDecisionLabel(c)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
