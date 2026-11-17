import { macroKcalShares, type MacroKey } from '../../lib/macros';

/** Thin bar with the share of calories from protein, carbs and fat. Absent macros are omitted. */
export function MacroSplitBar({ macros }: { macros: Record<MacroKey, number> }) {
  const shares = macroKcalShares(macros).filter(({ percent }) => percent > 0);
  if (!shares.length) return null;
  const label = shares.map(({ label, percent }) => `${label} ${Math.round(percent)} %`).join(', ');
  return (
    <div
      role="img"
      aria-label={`Reparto de calorías: ${label}`}
      title={label}
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-border"
    >
      {shares.map(({ key, color, percent }) => (
        <span
          key={key}
          className="h-full"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      ))}
    </div>
  );
}
