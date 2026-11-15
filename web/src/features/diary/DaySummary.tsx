import type { DaySummary as Summary } from '@lean/shared';
import { Link } from 'react-router';
import { Card } from '../../components/ui/Card';
import { CalorieRing } from './CalorieRing';
import { MacroBars } from './MacroBars';
export function DaySummary({ summary }: { summary: Summary }) {
  return (
    <Card>
      <div className="grid items-center gap-5 sm:grid-cols-2">
        <CalorieRing kcal={summary.eaten.kcal} target={summary.target?.kcal} />
        <MacroBars eaten={summary.eaten} target={summary.target} />
      </div>
      {!summary.target && (
        <Link
          to="/perfil"
          className="mt-4 flex min-h-11 items-center justify-center text-accent underline"
        >
          Definí tu objetivo
        </Link>
      )}
      {Object.values(summary.planned).some((value) => value > 0) && (
        <p className="mt-3 text-sm text-muted">Planificado: {summary.planned.kcal} kcal</p>
      )}
    </Card>
  );
}
