import { TextLogSheet } from '../features/textLog/TextLogSheet';
import { useTextLogFeatures } from '../features/textLog/api';
import { CheckinCard } from '../features/checkin/CheckinCard';
import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { MEALS, type Entry, type Meal } from '@lean/shared';
import { todayLocal, addDays, formatDayLabel, parseLocalDateParam } from '../lib/date';
import { useActiveGoal } from '../features/goals/api';
import { wasWizardSkipped } from '../features/goals/draft';
import { WeekBudgetBar } from '../features/goals/WeekBudgetBar';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { DaySummary } from '../features/diary/DaySummary';
import { QuickLogPrompt } from '../features/diary/QuickLogPrompt';
import { RepeatMealSheet } from '../features/diary/RepeatMealSheet';
import { MealSection } from '../features/diary/MealSection';
import { WaterCard } from '../features/diary/WaterCard';
import { ExerciseCard } from '../features/diary/ExerciseCard';
import { EntrySheet } from '../features/diary/EntrySheet';
import { AddFoodSheet } from '../features/foods/AddFoodSheet';
import { useDaySummary, useDiaryMutation } from '../features/diary/api';
import type { DiaryAction } from '../features/diary/optimistic';
export function Hoy() {
  const features = useTextLogFeatures();
  const [writing, setWriting] = useState(false);
  const [params, setParams] = useSearchParams();
  const today = todayLocal();
  const raw = params.get('fecha');
  const date = parseLocalDateParam(raw) ?? today;
  const title = formatDayLabel(date, today);
  const shortDate = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  const [adding, setAdding] = useState<{ date: string; meal: Meal } | null>(null);
  const [repeating, setRepeating] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const goal = useActiveGoal();
  const wizardSkipped = wasWizardSkipped();
  const query = useDaySummary(date);
  const mutation = useDiaryMutation();
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
    setRepeating(null);
    setWriting(false);
  }
  function mutate(action: DiaryAction) {
    mutation.mutate(action);
    setAdding(null);
    setEditing(null);
    setRepeating(null);
    setWriting(false);
  }
  if (goal.isSuccess && goal.data === null && !goal.isFetching && !wizardSkipped) {
    return <Navigate to="/objetivo/nuevo" replace />;
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
            aria-label={`${title}. Volver a hoy`}
          >
            <span>
              <span className="block text-2xl font-bold">{title}</span>
              {shortDate !== title && <span className="text-xs text-muted">{shortDate}</span>}
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
      <CheckinCard />
      {goal.isError && (
        <ErrorState
          message="No se pudo cargar tu objetivo."
          onRetry={() => {
            void goal.refetch();
          }}
        />
      )}
      {goal.isSuccess && goal.data === null && wizardSkipped && (
        <Card>
          <p>Definí tu objetivo para ver cuánto te queda</p>
          <Link
            to="/objetivo/nuevo"
            className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-accent px-4 py-2 font-semibold text-on-accent"
          >
            Definir objetivo
          </Link>
        </Card>
      )}
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
          <WeekBudgetBar date={date} />
          {features.data?.textLog && (
            <Button variant="secondary" onClick={() => setWriting(true)}>
              Escribir lo que comí
            </Button>
          )}
          {MEALS.map((meal) => {
            const section = query.data.meals.find((item) => item.meal === meal);
            return (
              section && (
                <MealSection
                  key={meal}
                  meal={section}
                  onAdd={() => setAdding({ date, meal })}
                  onRepeat={() => setRepeating(meal)}
                  onEdit={setEditing}
                  onEat={(entry) => mutate({ kind: 'edit', entry, changes: { status: 'eaten' } })}
                />
              )
            );
          })}
        </>
      )}
      <WaterCard date={date} />
      <ExerciseCard date={date} />
      <QuickLogPrompt
        summary={query.data}
        ready={
          goal.isSuccess &&
          !goal.isFetching &&
          (goal.data !== null || wizardSkipped) &&
          query.isSuccess &&
          !query.isFetching &&
          !adding &&
          !editing &&
          !repeating &&
          !writing
        }
        onTextLog={features.data?.textLog ? () => setWriting(true) : undefined}
        onChoose={(meal) => {
          navigate(todayLocal());
          setAdding({ date: todayLocal(), meal });
        }}
      />
      {writing && (
        <TextLogSheet
          key={date}
          date={date}
          textLogAi={features.data?.textLogAi ?? false}
          onClose={() => setWriting(false)}
        />
      )}
      {repeating && (
        <RepeatMealSheet date={date} meal={repeating} onClose={() => setRepeating(null)} />
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
