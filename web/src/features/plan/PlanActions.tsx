import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { isoWeekOf, isoWeekRange, type DaySummary } from '@lean/shared';
import { addDays } from '../../lib/date';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { useToast } from '../../components/ui/Toast';
import { getDaySummary, summaryKey, useDiaryMutation, waitForDiaryIdle } from '../diary/api';
import { CopyDaySheet } from './CopyDaySheet';
import { useCopyEntries, useGenerateShopping, type CopyEntriesBody } from './api';
export function PlanActions({ week, summary }: { week: string; summary: DaySummary }) {
  const [sheet, setSheet] = useState<'actions' | 'copy' | 'clear' | null>(null);
  const [pendingCopy, setPendingCopy] = useState<Omit<CopyEntriesBody, 'mode'> | null>(null);
  const [checking, setChecking] = useState(false);
  const client = useQueryClient();
  const copy = useCopyEntries();
  const shopping = useGenerateShopping();
  const diary = useDiaryMutation();
  const toast = useToast();
  const navigate = useNavigate();
  const diaryPending = useIsMutating({ mutationKey: ['diary'] }) > 0;
  const busy = checking || copy.isPending || shopping.isPending || diaryPending;
  async function performCopy(body: CopyEntriesBody) {
    try {
      await copy.mutateAsync(body);
      setPendingCopy(null);
      setSheet(null);
      toast(body.scope === 'day' ? 'Día copiado' : 'Semana copiada');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo copiar.');
    }
  }
  async function prepareCopy(body: Omit<CopyEntriesBody, 'mode'>) {
    setChecking(true);
    try {
      await waitForDiaryIdle(client);
      const dates =
        body.scope === 'day'
          ? [body.to]
          : Array.from({ length: 7 }, (_, i) => addDays(isoWeekRange(body.to).from, i));
      const destinations = await Promise.all(
        dates.map((date) =>
          client.fetchQuery({
            queryKey: summaryKey(date),
            queryFn: ({ signal }) => getDaySummary(date, signal),
            staleTime: 0,
          }),
        ),
      );
      const hasPlanned = destinations.some((day) =>
        day.meals.some((meal) => meal.entries.some((entry) => entry.status === 'planned')),
      );
      if (hasPlanned) {
        setSheet(null);
        setPendingCopy(body);
      } else await performCopy({ ...body, mode: 'append' });
    } catch (error) {
      toast(error instanceof Error ? error.message : 'No se pudo consultar el destino.');
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setSheet('actions')}>
        Acciones
      </Button>
      {sheet === 'actions' && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
          title="Acciones del plan"
        >
          <div className="flex flex-col gap-3">
            {checking && diaryPending && <p role="status">Esperando…</p>}
            <Button disabled={busy} onClick={() => setSheet('copy')}>
              Copiar este día a…
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void prepareCopy({
                  scope: 'week',
                  from: isoWeekOf(addDays(isoWeekRange(week).from, -7)),
                  to: week,
                });
              }}
            >
              Copiar la semana anterior
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => setSheet('clear')}>
              Vaciar lo planificado del día
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setChecking(true);
                try {
                  await waitForDiaryIdle(client);
                  await shopping.mutateAsync(week);
                  setSheet(null);
                  navigate(`/compras?semana=${week}`);
                } catch (error) {
                  toast(error instanceof Error ? error.message : 'No se pudo generar la lista.');
                } finally {
                  setChecking(false);
                }
              }}
            >
              Generar lista de compras
            </Button>
          </div>
        </Sheet>
      )}
      {sheet === 'copy' && (
        <CopyDaySheet
          from={summary.date}
          busy={busy}
          onClose={() => setSheet(null)}
          onCopy={(to) => {
            void prepareCopy({ scope: 'day', from: summary.date, to });
          }}
        />
      )}
      {pendingCopy && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open && !busy) setPendingCopy(null);
          }}
          title="El destino ya tiene comidas planificadas"
        >
          <p className="mb-4">¿Querés agregar las comidas o reemplazar lo planificado?</p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() => {
                void performCopy({ ...pendingCopy, mode: 'append' });
              }}
            >
              Agregar
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                void performCopy({ ...pendingCopy, mode: 'replace' });
              }}
            >
              Reemplazar
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPendingCopy(null)}>
              Cancelar
            </Button>
          </div>
        </Sheet>
      )}
      {sheet === 'clear' && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) setSheet(null);
          }}
          title="Vaciar lo planificado del día"
        >
          <p className="mb-4">¿Borramos todas las comidas planificadas de este día?</p>
          {checking && diaryPending && <p role="status">Esperando…</p>}
          <div className="flex gap-3">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setChecking(true);
                try {
                  await waitForDiaryIdle(client);
                  const current = client.getQueryData<DaySummary>(summaryKey(summary.date));
                  const entries = (current?.meals ?? [])
                    .flatMap((meal) => meal.entries)
                    .filter((entry) => entry.status === 'planned' && !entry.id.startsWith('temp-'));
                  const results = await Promise.allSettled(
                    entries.map((entry) => diary.mutateAsync({ kind: 'delete', entry })),
                  );
                  if (results.every((result) => result.status === 'fulfilled'))
                    toast('Plan del día vaciado');
                  setSheet(null);
                } finally {
                  setChecking(false);
                }
              }}
            >
              Vaciar
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setSheet(null)}>
              Cancelar
            </Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
