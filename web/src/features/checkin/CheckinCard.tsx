import { useId, useRef, useState } from 'react';
import { formatNumber } from '../../lib/macros';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { usePendingCheckin, useResolveCheckin } from './api';
import { checkinMessage, checkinTitle } from './messages';
import { CheckinDetailSheet } from './CheckinDetailSheet';

export function CheckinCard() {
  const toast = useToast();
  const query = usePendingCheckin();
  const mutation = useResolveCheckin();
  const [open, setOpen] = useState(false);
  const detailButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const checkin = query.data?.checkin;
  if (query.isError)
    return (
      <ErrorState
        message="No se pudo cargar tu revisión semanal."
        onRetry={() => void query.refetch()}
      />
    );
  if (query.isPending)
    return (
      <div aria-label="Cargando revisión semanal">
        <Skeleton className="h-24" />
      </div>
    );
  if (!checkin) return null;
  const resolve = (accept: boolean) =>
    mutation.mutate(
      { checkin, accept },
      {
        onSuccess: (result) => {
          if (result && accept && checkin.status === 'adjust') toast('Actualizaste tus metas');
        },
      },
    );
  return (
    <Card role="region" aria-labelledby={titleId} className="space-y-3">
      <h2 id={titleId} className="text-xl font-semibold">
        {checkinTitle(checkin)}
      </h2>
      <p>{checkinMessage(checkin)}</p>
      {checkin.status === 'adjust' && checkin.proposed && (
        <p className="text-sm">
          Metas propuestas por día · Proteína {formatNumber(checkin.proposed.proteinG)} g ·
          Carbohidratos {formatNumber(checkin.proposed.carbsG)} g · Grasa{' '}
          {formatNumber(checkin.proposed.fatG)} g
        </p>
      )}
      {mutation.isError && <p role="alert">No se pudo guardar. Probá de nuevo.</p>}
      <div className="flex flex-wrap gap-2">
        {checkin.status === 'adjust' ? (
          <>
            <Button disabled={mutation.isPending} onClick={() => resolve(true)}>
              Aceptar
            </Button>
            <Button
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => resolve(false)}
            >
              Mantener como está
            </Button>
            <Button
              ref={detailButtonRef}
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => setOpen(true)}
            >
              Ver detalle
            </Button>
          </>
        ) : (
          <Button
            disabled={mutation.isPending}
            aria-label={checkin.status === 'insufficient_data' ? 'Descartar' : undefined}
            onClick={() => resolve(checkin.status === 'on_track')}
          >
            Entendido
          </Button>
        )}
      </div>
      <CheckinDetailSheet
        checkin={checkin}
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={detailButtonRef}
      />
    </Card>
  );
}
