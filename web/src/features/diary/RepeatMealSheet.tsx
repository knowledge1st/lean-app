import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { addDays, formatDayLabel, parseLocalDateParam, todayLocal } from '../../lib/date';
import { formatNumber, MEAL_LABELS } from '../../lib/macros';
import { copyEntries } from '../plan/api';
import { deleteEntry, summaryKey, useDaySummary } from './api';

export function RepeatMealSheet({
  date,
  meal,
  onClose,
}: {
  date: string;
  meal: Meal;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(
    () => parseLocalDateParam(addDays(date, -1)) ?? addDays(date, 1),
  );
  const query = useDaySummary(from);
  const entries = query.data?.meals.find((section) => section.meal === meal)?.entries ?? [];
  const client = useQueryClient();
  const toast = useToast();
  const invalidate = () =>
    Promise.all([
      client.refetchQueries({ queryKey: summaryKey(date) }),
      client.invalidateQueries({ queryKey: ['progress', 'entries'] }),
      client.invalidateQueries({ queryKey: ['summary', 'week'] }),
      client.invalidateQueries({ queryKey: ['foods', 'recent'] }),
      client.invalidateQueries({ queryKey: ['foods', 'frequent'] }),
    ]);
  const mutation = useMutation({
    mutationFn: () =>
      copyEntries({
        scope: 'meal',
        from,
        to: date,
        meal,
        status: date <= todayLocal() ? 'eaten' : 'planned',
      }),
    onSuccess: async (created) => {
      await invalidate();
      onClose();
      toast(
        `Copiaste ${created.length} ${created.length === 1 ? 'alimento' : 'alimentos'} a ${MEAL_LABELS[meal]}`,
        {
          label: 'Deshacer',
          onAction: () => {
            void Promise.allSettled(created.map((entry) => deleteEntry(entry.id))).then(
              async (results) => {
                await invalidate();
                if (results.some((result) => result.status === 'rejected'))
                  toast('No se pudieron borrar todos los alimentos. Revisá la comida.');
              },
            );
          },
        },
      );
    },
  });
  function adjacent(direction: number) {
    const next = addDays(from, direction);
    return next === date ? addDays(next, direction) : next;
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Repetir ${MEAL_LABELS[meal]}`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          aria-label="Día origen anterior"
          disabled={mutation.isPending || !parseLocalDateParam(adjacent(-1))}
          onClick={() => {
            setFrom(adjacent(-1));
            mutation.reset();
          }}
        >
          ←
        </Button>
        <span aria-live="polite">
          {formatDayLabel(from, todayLocal())} ·{' '}
          {new Intl.DateTimeFormat('es-AR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            ...(from.slice(0, 4) !== todayLocal().slice(0, 4) ? { year: 'numeric' } : {}),
            timeZone: 'UTC',
          }).format(new Date(`${from}T12:00:00Z`))}
        </span>
        <Button
          variant="ghost"
          aria-label="Día origen siguiente"
          disabled={mutation.isPending || !parseLocalDateParam(adjacent(1))}
          onClick={() => {
            setFrom(adjacent(1));
            mutation.reset();
          }}
        >
          →
        </Button>
      </div>
      {query.isPending ? (
        <Skeleton className="h-32" aria-label="Cargando alimentos" />
      ) : query.isError ? (
        <ErrorState
          message="No se pudo cargar la comida."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : entries.length ? (
        <ul className="mb-4 divide-y divide-border">
          {entries.map((entry) => (
            <li key={entry.id} className="py-3">
              <span>{entry.food.name}</span>
              <span className="block text-sm text-muted">
                {formatNumber(entry.grams)} g · {formatNumber(entry.kcal)} kcal
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4">No cargaste nada en {MEAL_LABELS[meal]} ese día.</p>
      )}
      {mutation.isError && (
        <p role="alert">No se pudo copiar la comida. {mutation.error.message}</p>
      )}
      <Button
        className="w-full"
        disabled={!entries.length || query.isError || query.isPending || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending
          ? 'Copiando…'
          : entries.length === 0
            ? 'Copiar'
            : `Copiar ${entries.length} ${entries.length === 1 ? 'alimento' : 'alimentos'} a ${formatDayLabel(date, todayLocal())}`}
      </Button>
    </Sheet>
  );
}
