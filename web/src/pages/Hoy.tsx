import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { MEALS, type Entry, type Meal } from '@lean/shared';
import { todayLocal, addDays, formatDayLabel, parseLocalDateParam } from '../lib/date';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { DaySummary } from '../features/diary/DaySummary';
import { MealSection } from '../features/diary/MealSection';
import { EntrySheet } from '../features/diary/EntrySheet';
import { AddFoodSheet } from '../features/foods/AddFoodSheet';
import { useDaySummary, useDiaryMutation } from '../features/diary/api';
import type { DiaryAction } from '../features/diary/optimistic';
export function Hoy() {
  const [params, setParams] = useSearchParams();
  const today = todayLocal();
  const raw = params.get('fecha');
  const date = parseLocalDateParam(raw) ?? today;
  const [adding, setAdding] = useState<{ date: string; meal: Meal } | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const query = useDaySummary(date);
  const mutation = useDiaryMutation();
  const locked = useRef(false);
  useEffect(() => {
    if (raw !== null && !parseLocalDateParam(raw)) {
      const next = new URLSearchParams(params);
      next.set('fecha', today);
      setParams(next, { replace: true });
    }
  }, [raw, today, params, setParams]);
  function navigate(nextDate: string) {
    const next = new URLSearchParams(params);
    next.set('fecha', nextDate);
    setParams(next, { replace: true });
    setAdding(null);
    setEditing(null);
  }
  function mutate(action: DiaryAction) {
    if (locked.current || mutation.isPending) return;
    locked.current = true;
    mutation.mutate(action, {
      onSettled: () => {
        locked.current = false;
      },
    });
    setAdding(null);
    setEditing(null);
  }
  return (
    <section className="min-w-0 space-y-5">
      <header className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          aria-label="Día anterior"
          disabled={!parseLocalDateParam(addDays(date, -1))}
          onClick={() => navigate(addDays(date, -1))}
        >
          ←
        </Button>
        <h1>
          <Button
            variant="ghost"
            onClick={() => navigate(today)}
            aria-label={`${formatDayLabel(date, today)}. Volver a hoy`}
          >
            <span>
              <span className="block text-2xl font-bold">{formatDayLabel(date, today)}</span>
              <span className="text-xs text-muted">{date}</span>
            </span>
          </Button>
        </h1>
        <Button
          variant="ghost"
          aria-label="Día siguiente"
          disabled={!parseLocalDateParam(addDays(date, 1))}
          onClick={() => navigate(addDays(date, 1))}
        >
          →
        </Button>
      </header>
      {query.isPending ? (
        <div aria-label="Cargando día" className="space-y-4">
          <Skeleton className="h-64" />
          {MEALS.map((meal) => (
            <Skeleton key={meal} className="h-32" />
          ))}
        </div>
      ) : !query.data ? (
        <ErrorState
          message={query.error?.message ?? 'No se pudo cargar el día.'}
          onRetry={() => {
            void query.refetch();
          }}
        />
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
          <DaySummary summary={query.data} />
          {MEALS.map((meal) => {
            const section = query.data.meals.find((item) => item.meal === meal);
            return (
              section && (
                <MealSection
                  key={meal}
                  meal={section}
                  disabled={mutation.isPending}
                  onAdd={() => setAdding({ date, meal })}
                  onEdit={setEditing}
                  onEat={(entry) => mutate({ kind: 'edit', entry, changes: { status: 'eaten' } })}
                />
              )
            );
          })}
        </>
      )}
      {adding && adding.date === date && (
        <AddFoodSheet
          key={`${adding.date}-${adding.meal}`}
          {...adding}
          onClose={() => setAdding(null)}
          onAdd={(food, grams) =>
            mutate({
              kind: 'add',
              ...adding,
              food,
              grams,
              temporaryId: `temp-${crypto.randomUUID()}`,
            })
          }
        />
      )}
      {editing && editing.date === date && (
        <EntrySheet
          key={editing.id}
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(changes) => mutate({ kind: 'edit', entry: editing, changes })}
          onDelete={() => mutate({ kind: 'delete', entry: editing })}
        />
      )}
    </section>
  );
}
