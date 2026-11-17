import { formatNumber } from '../../lib/macros';
import { useState } from 'react';
import type { ExerciseLog } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useExercise } from './activityApi';
import { ExerciseSheet } from './ExerciseSheet';

export function ExerciseCard({ date }: { date: string }) {
  return <ExerciseDay key={date} date={date} />;
}
function ExerciseDay({ date }: { date: string }) {
  const query = useExercise(date);
  const [editing, setEditing] = useState<ExerciseLog | 'new' | null>(null);
  return (
    <Card className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Ejercicio</h2>
        <Button variant="ghost" aria-label="Agregar ejercicio" onClick={() => setEditing('new')}>
          Agregar
        </Button>
      </div>
      {query.isPending ? (
        <div aria-label="Cargando ejercicio">
          <Skeleton />
        </div>
      ) : !query.data ? (
        <ErrorState
          message="No se pudo cargar el ejercicio."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          {query.isError && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>No se pudo actualizar</span>
              <Button variant="ghost" onClick={() => void query.refetch()}>
                Reintentar
              </Button>
            </div>
          )}
          <p>
            Total: {formatNumber(query.data.logs.reduce((total, log) => total + log.kcal, 0))} kcal
          </p>
          {query.data.logs.length ? (
            <ul className="space-y-2">
              {query.data.logs.map((log) => (
                <li key={log.id}>
                  <Button
                    variant="secondary"
                    className="w-full justify-start! text-left whitespace-normal [overflow-wrap:anywhere]"
                    onClick={() => setEditing(log)}
                  >
                    {log.activity} · {formatNumber(log.minutes)} min
                    {log.kcal > 0 ? ` · ${formatNumber(log.kcal)} kcal` : ''}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Todavía no registraste ejercicio hoy</p>
          )}
        </>
      )}
      {editing && (
        <ExerciseSheet
          key={editing === 'new' ? 'new' : editing.id}
          date={date}
          {...(editing !== 'new' ? { entry: editing } : {})}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}
