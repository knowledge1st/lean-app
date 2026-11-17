import type { Macros } from '@lean/shared';
import { MACROS, formatNumber, type MacroKey } from '../../lib/macros';
export function MacroBars({
  eaten,
  target,
  selected = null,
  onSelect,
}: {
  eaten: Macros;
  target: Macros | null;
  selected?: MacroKey | null;
  onSelect?: ((macro: MacroKey | null) => void) | undefined;
}) {
  return (
    <div
      className="min-w-0 space-y-2"
      role={onSelect ? 'group' : undefined}
      aria-label={onSelect ? 'Resaltar alimentos por macro' : undefined}
    >
      {MACROS.map(({ key, label, color }) => {
        const active = selected === key;
        const content = (
          <>
            <div className="mb-1 flex flex-wrap justify-between gap-1 text-sm">
              <span className={active ? 'font-semibold' : ''}>{label}</span>
              <span>
                {formatNumber(eaten[key])}
                {target ? ` / ${formatNumber(target[key])}` : ''} g
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full"
                style={{
                  backgroundColor: color,
                  width: `${target && target[key] > 0 ? Math.min(eaten[key] / target[key], 1) * 100 : 0}%`,
                }}
              />
            </div>
          </>
        );
        if (!onSelect) {
          return (
            <div key={key} className="px-2 py-1">
              {content}
            </div>
          );
        }
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(active ? null : key)}
            className="block min-h-11 w-full rounded-xl border-2 px-2 py-1 text-left transition motion-reduce:transition-none"
            style={{
              borderColor: active ? color : 'transparent',
              backgroundColor: active ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
