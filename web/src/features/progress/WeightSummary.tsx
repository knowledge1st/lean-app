import type { ActiveGoal } from '@lean/shared';
import { Card } from '../../components/ui/Card';
import { formatNumber } from '../../lib/macros';
import {
  expectedWeightAt,
  formatPlanDifference,
  planDifference,
  signedKg,
  trajectory,
  type ProgressLog,
} from './calc';
export function WeightSummary({
  logs,
  goal,
  today,
}: {
  logs: ProgressLog[];
  goal?: ActiveGoal | null;
  today: string;
}) {
  const trend = [...logs].reverse().find((l) => l.trendWeightKg !== null)?.trendWeightKg;
  const start = goal?.startWeightKg ?? logs.find((l) => l.weightKg !== null)?.weightKg;
  const expected = expectedWeightAt(trajectory(goal), today);
  return (
    <Card className="space-y-2" aria-label="Resumen de peso">
      <p className="text-sm text-muted">Peso de tendencia actual</p>
      <p className="text-3xl font-bold">{trend != null ? `${formatNumber(trend)} kg` : '—'}</p>
      {trend == null && (
        <p className="text-sm text-muted">Registrá tu peso para ver la tendencia.</p>
      )}
      {trend != null && start != null && <p>{signedKg(trend - start)} kg desde el inicio</p>}
      {trend != null && expected !== null && goal?.targetWeightKg != null && (
        <p>
          {formatPlanDifference(
            planDifference({
              trendKg: trend,
              expectedKg: expected,
              startKg: goal.startWeightKg,
              targetKg: goal.targetWeightKg,
            }),
          )}
        </p>
      )}
    </Card>
  );
}
