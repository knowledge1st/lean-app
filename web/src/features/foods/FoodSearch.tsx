import { useEffect, useState } from 'react';
import type { Food } from '@lean/shared';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useFoodList, useFoodSearch } from './api';
import { FoodResultRow } from './FoodResultRow';
export function FoodSearch({
  onSelect,
  onCreate,
  busy = false,
  error,
}: {
  onSelect: (food: Food) => void;
  onCreate: () => void;
  busy?: boolean;
  error?: string | undefined;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'recent' | 'frequent'>('recent');
  const normalized = text.trim().slice(0, 80);
  useEffect(() => {
    const timer = setTimeout(() => setQ(normalized), 300);
    return () => clearTimeout(timer);
  }, [normalized]);
  const search = useFoodSearch(q);
  const list = useFoodList(tab, !normalized);
  const active = normalized ? search : list;
  const waiting = !!normalized && normalized !== q;
  const items = normalized ? search.data?.items : list.data;
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            autoFocus
            label="Buscar alimento"
            placeholder="Nombre o marca"
            maxLength={80}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          disabled
          aria-label="Escanear: Próximamente"
          title="Próximamente"
        >
          Escanear
        </Button>
      </div>
      {!normalized && (
        <div className="flex gap-2" role="group" aria-label="Alimentos habituales">
          <Button
            variant={tab === 'recent' ? 'primary' : 'secondary'}
            aria-pressed={tab === 'recent'}
            onClick={() => setTab('recent')}
          >
            Recientes
          </Button>
          <Button
            variant={tab === 'frequent' ? 'primary' : 'secondary'}
            aria-pressed={tab === 'frequent'}
            onClick={() => setTab('frequent')}
          >
            Frecuentes
          </Button>
        </div>
      )}
      {!waiting && active.isError && !!items?.length && (
        <div role="alert" className="flex items-center gap-2 text-sm text-muted">
          <span>{active.error.message}</span>
          <Button variant="ghost" onClick={() => void active.refetch()}>
            Reintentar
          </Button>
        </div>
      )}
      {busy && <p role="status">Importando alimento…</p>}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {waiting || active.isPending || (!normalized && !items?.length && list.isFetching) ? (
        <Skeleton className="h-24" />
      ) : active.isError && !items?.length ? (
        <ErrorState
          message={active.error.message}
          onRetry={() => {
            void active.refetch();
          }}
        />
      ) : (
        <div>
          {items?.map((food) => (
            <FoodResultRow
              key={food.id ?? food.barcode ?? food.name}
              food={food}
              onSelect={onSelect}
              disabled={busy}
            />
          ))}
          {!items?.length && (
            <p className="py-5 text-muted">
              {normalized
                ? `No encontramos “${normalized}”.`
                : tab === 'recent'
                  ? 'Todavía no hay alimentos recientes.'
                  : 'Todavía no hay alimentos frecuentes.'}
            </p>
          )}
        </div>
      )}
      {normalized && !waiting && search.data?.offAvailable === false && (
        <p className="text-sm text-muted">Open Food Facts no está disponible en este momento.</p>
      )}
      <Button variant="secondary" disabled={busy} onClick={onCreate}>
        Crear alimento
      </Button>
    </div>
  );
}
