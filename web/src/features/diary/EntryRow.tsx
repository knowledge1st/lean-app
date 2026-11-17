import { useEffect, useRef } from 'react';
import type { Entry } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { formatNumber, MACROS, type MacroKey } from '../../lib/macros';
import { MacroSplitBar } from './MacroSplitBar';
export function EntryRow({
  entry,
  disabled,
  missed,
  highlight = null,
  onEdit,
  onEat,
}: {
  entry: Entry;
  missed?: boolean | undefined;
  disabled?: boolean | undefined;
  highlight?: MacroKey | null;
  onEdit: (entry: Entry) => void;
  onEat: (entry: Entry) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const temporary = entry.id.startsWith('temp-');
  const macro = highlight ? MACROS.find(({ key }) => key === highlight) : undefined;
  const contributes = !!macro && entry[macro.key] > 0;
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
      data-highlighted={contributes || undefined}
      className={`-mx-2 min-w-0 border-t border-border px-2 pb-3 transition motion-reduce:transition-none ${entry.status === 'planned' ? 'border-dashed bg-bg' : ''} ${macro && !contributes ? 'opacity-45' : ''}`}
      style={
        macro && contributes
          ? {
              backgroundColor: `color-mix(in srgb, ${macro.color} 14%, transparent)`,
              boxShadow: `inset 3px 0 0 ${macro.color}`,
            }
          : undefined
      }
    >
      <button
        type="button"
        disabled={disabled || temporary}
        onClick={() => onEdit(entry)}
        className="flex min-h-11 w-full min-w-0 items-center gap-3 pt-3 pb-2 text-left disabled:cursor-wait"
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
          {macro && contributes && (
            <span className="block text-sm font-semibold" style={{ color: macro.color }}>
              {formatNumber(entry[macro.key])} g de {macro.label.toLowerCase()}
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm">{formatNumber(entry.kcal)} kcal</span>
      </button>
      <MacroSplitBar macros={entry} />
      {entry.status === 'planned' && (
        <Button variant="ghost" disabled={disabled || temporary} onClick={() => onEat(entry)}>
          Ya lo comí
        </Button>
      )}
    </div>
  );
}
