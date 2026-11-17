import { useEffect, useRef } from 'react';
import type { Entry } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { formatNumber } from '../../lib/macros';
export function EntryRow({
  entry,
  disabled,
  missed,
  onEdit,
  onEat,
}: {
  entry: Entry;
  missed?: boolean | undefined;
  disabled?: boolean | undefined;
  onEdit: (entry: Entry) => void;
  onEat: (entry: Entry) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const temporary = entry.id.startsWith('temp-');
  useEffect(() => {
    if (temporary) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      row.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [temporary]);
  return (
    <div
      ref={row}
      className={`min-w-0 border-t border-border ${entry.status === 'planned' ? 'border-dashed bg-bg' : ''}`}
    >
      <button
        type="button"
        disabled={disabled || temporary}
        onClick={() => onEdit(entry)}
        className="flex min-h-11 w-full min-w-0 items-center gap-3 py-3 text-left disabled:cursor-wait"
      >
        <span className="min-w-0 flex-1">
          <span title={entry.food.name} className="line-clamp-2 break-words font-medium">
            {entry.food.name}
          </span>
          {entry.food.brand && (
            <span title={entry.food.brand} className="line-clamp-2 break-words text-sm text-muted">
              {entry.food.brand}
            </span>
          )}
          <span className="text-sm text-muted">
            {formatNumber(entry.grams)} g
            {entry.status === 'planned' ? (missed ? ' · No cumplido' : ' · Planificado') : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm">{formatNumber(entry.kcal)} kcal</span>
      </button>
      {entry.status === 'planned' && (
        <Button variant="ghost" disabled={disabled || temporary} onClick={() => onEat(entry)}>
          Ya lo comí
        </Button>
      )}
    </div>
  );
}
