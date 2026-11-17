import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useIsMutating } from '@tanstack/react-query';
import { addDays, isoWeekOf, isoWeekRange, isoWeekSchema } from '@lean/shared';
import { todayLocal } from '../lib/date';
import { formatWeekRange, validWeekOf } from '../features/plan/dates';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { AddItemInput } from '../features/shopping/AddItemInput';
import { ShoppingList } from '../features/shopping/ShoppingList';
import { ShoppingActions } from '../features/shopping/ShoppingActions';
import { useShoppingBulk, useShoppingList } from '../features/shopping/api';

export function Compras() {
  const [params, setParams] = useSearchParams();
  const parsed = isoWeekSchema.safeParse(params.get('semana'));
  const week = parsed.success ? parsed.data : isoWeekOf(todayLocal());
  useEffect(() => {
    if (params.get('semana') === week) return;
    const next = new URLSearchParams(params);
    next.set('semana', week);
    setParams(next, { replace: true });
  }, [params, setParams, week]);
  return (
    <ShoppingWeek
      key={week}
      week={week}
      onSelect={(value) => {
        const next = new URLSearchParams(params);
        next.set('semana', value);
        setParams(next);
      }}
    />
  );
}
function ShoppingWeek({ week, onSelect }: { week: string; onSelect: (week: string) => void }) {
  const { from, to } = isoWeekRange(week);
  const previous = validWeekOf(addDays(from, -7));
  const next = validWeekOf(addDays(from, 7));
  const query = useShoppingList(week);
  const bulk = useShoppingBulk(week);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const bulkCount = useIsMutating({ mutationKey: ['shopping', 'bulk'] });
  const blocked = busy || bulkCount > 0;
  const [noPlanned, setNoPlanned] = useState(false);
  const items = query.data ?? [];
  const checked = items.filter((item) => item.checked).length;
  async function run(kind: 'generate' | 'clear') {
    setBusy(true);
    try {
      const result = await bulk.run(kind);
      if (kind === 'generate') setNoPlanned(!result.some((item) => !item.manual));
    } catch {
      /* The mutation displays the error. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="min-w-0 space-y-5 pb-20">
      <header className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          aria-label="Semana anterior"
          disabled={!previous}
          onClick={() => previous && onSelect(previous)}
        >
          ←
        </Button>
        <h1 className="text-center text-2xl font-bold">
          Compras<span className="block text-base">{formatWeekRange(from, to)}</span>
        </h1>
        <Button
          variant="ghost"
          aria-label="Semana siguiente"
          disabled={!next}
          onClick={() => next && onSelect(next)}
        >
          →
        </Button>
      </header>
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <p aria-live="polite" className="text-lg font-semibold">
            {checked} de {items.length}
          </p>
          <ShoppingActions
            checked={checked}
            disabled={blocked || !query.data}
            onGenerate={() => void run('generate')}
            onClear={() => void run('clear')}
          />
        </div>
      )}
      {query.isPending && (
        <div aria-label="Cargando compras" className="space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      )}
      {query.isError && (
        <ErrorState
          message={
            query.data
              ? 'No se pudo actualizar. Seguís viendo tu lista guardada.'
              : query.error.message
          }
          onRetry={() => void query.refetch()}
        />
      )}
      {noPlanned && (
        <div role="status" className="space-y-2">
          <p>No hay comidas planificadas para esta semana</p>
          <Link
            className="inline-flex min-h-11 items-center text-accent underline"
            to={`/plan?semana=${week}`}
          >
            Ir a Plan
          </Link>
        </div>
      )}
      {query.data &&
        (items.length ? (
          <ShoppingList items={items} week={week} disabled={blocked} />
        ) : (
          <EmptyState
            title="Tu lista está vacía"
            description="Generá la lista desde el plan o agregá lo que necesitás con el campo de abajo."
            action={
              <div className="flex flex-col gap-2">
                <Button disabled={blocked} onClick={() => void run('generate')}>
                  Generar desde el plan
                </Button>
                <Button variant="secondary" onClick={() => inputRef.current?.focus()}>
                  Agregar a mano
                </Button>
              </div>
            }
          />
        ))}
      <AddItemInput week={week} inputRef={inputRef} disabled={blocked || !query.data} />
    </section>
  );
}
