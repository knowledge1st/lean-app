import type { DaySummary } from '@lean/shared';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { MACROS, formatNumber } from '../../lib/macros';
export function PlanSummary({ summary }: { summary: DaySummary }) {
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">Total del día</h2>
      {[{ key: 'kcal' as const, label: 'Energía' }, ...MACROS].map(({ key, label }) => {
        const total = summary.eaten[key] + summary.planned[key];
        const target = summary.target?.[key];
        const unit = key === 'kcal' ? 'kcal' : 'g';
        return (
          <div key={key} className="flex flex-wrap justify-between gap-2">
            <span>{label}</span>
            <span>
              {formatNumber(total)}
              {target != null ? ` / ${formatNumber(target)}` : ''} {unit}
              {target != null && (
                <span className="block text-sm text-muted">
                  {total > target ? 'Sobran' : 'Faltan'} {formatNumber(Math.abs(target - total))}{' '}
                  {unit}
                </span>
              )}
            </span>
          </div>
        );
      })}
      {!summary.target && (
        <Link className="inline-flex min-h-11 items-center text-accent" to="/objetivo/nuevo">
          Definí tu objetivo
        </Link>
      )}
    </Card>
  );
}
