import { formatNumber, type MacroKey } from '../../lib/macros';
import type { DaySummary as Summary } from '@lean/shared';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { CalorieRing } from './CalorieRing';
import { MacroBars } from './MacroBars';
export function DaySummary({
  summary,
  selectedMacro = null,
  onSelectMacro,
}: {
  summary: Summary;
  selectedMacro?: MacroKey | null;
  onSelectMacro?: (macro: MacroKey | null) => void;
}) {
  return (
    <Card>
      <div className="grid items-center gap-5 sm:grid-cols-2">
        <CalorieRing kcal={summary.eaten.kcal} target={summary.target?.kcal} />
        <MacroBars
          eaten={summary.eaten}
          target={summary.target}
          selected={selectedMacro}
          onSelect={onSelectMacro}
        />
      </div>
      {!summary.target && (
        <Link
          to="/objetivo/nuevo"
          className="mt-4 flex min-h-11 items-center justify-center text-accent underline"
        >
          Definí tu objetivo
        </Link>
      )}
      {Object.values(summary.planned).some((value) => value > 0) && (
        <p className="mt-3 text-sm text-muted">
          Planificado: {formatNumber(summary.planned.kcal)} kcal
        </p>
      )}
    </Card>
  );
}
