import type { Macros } from '@lean/shared';
import { MACROS, formatNumber } from '../../lib/macros';
export function MacroBars({ eaten, target }: { eaten: Macros; target: Macros | null }) {
  return (
    <div className="min-w-0 space-y-4">
      {MACROS.map(({ key, label, color }) => (
        <div key={key}>
          <div className="mb-1 flex flex-wrap justify-between gap-1 text-sm">
            <span>{label}</span>
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
        </div>
      ))}
    </div>
  );
}
