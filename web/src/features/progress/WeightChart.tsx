import { useState } from 'react';
import type { ActiveGoal } from '@lean/shared';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../../components/ui/Button';
import { formatNumber } from '../../lib/macros';
import {
  chartAxis,
  expectedWeightAt,
  shortDate,
  timestamp,
  trajectory,
  weightWindow,
  type ProgressLog,
  type WeightRange,
} from './calc';

export default function WeightChart({
  logs,
  goal,
  today,
}: {
  logs: ProgressLog[];
  goal?: ActiveGoal | null;
  today: string;
}) {
  const [range, setRange] = useState<WeightRange>('month');
  const visible = weightWindow(logs, goal, today, range);
  const axis = chartAxis(visible.data.flatMap((p) => [p.weight, p.trend, p.expected]));
  const points = trajectory(goal);
  const last = [...logs].reverse().find((l) => l.weightKg !== null);
  const trend = [...logs].reverse().find((l) => l.trendWeightKg !== null)?.trendWeightKg;
  const expected = expectedWeightAt(points, today);
  return (
    <figure className="min-w-0 space-y-4" aria-label="Evolución del peso">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Rango del gráfico">
        {(
          [
            ['month', '1 mes'],
            ['quarter', '3 meses'],
            ['all', 'Todo'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            variant={range === key ? 'primary' : 'secondary'}
            aria-pressed={range === key}
            onClick={() => setRange(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <ul className="flex flex-wrap gap-4 text-sm" aria-label="Leyenda">
        <li style={{ color: 'var(--fat)' }}>● Registrado</li>
        <li style={{ color: 'var(--accent)' }}>━ Tendencia</li>
        {points.length > 0 && <li style={{ color: 'var(--protein)' }}>┄ Esperado</li>}
      </ul>
      <div aria-hidden="true" className="h-60 min-w-0">
        <ResponsiveContainer width="100%" height={240} minWidth={0}>
          <LineChart
            data={visible.data}
            margin={{ top: 12, right: 22, bottom: 8, left: 0 }}
            accessibilityLayer={false}
          >
            <XAxis
              dataKey="time"
              type="number"
              domain={[timestamp(visible.from), timestamp(visible.to)]}
              tickFormatter={shortDate}
              tickCount={3}
              minTickGap={30}
              stroke="var(--muted)"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              width={48}
              domain={axis.domain}
              ticks={axis.ticks}
              tickFormatter={(v) => formatNumber(Number(v))}
              stroke="var(--muted)"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={(v) => shortDate(Number(v))}
              formatter={(v) => `${formatNumber(Number(v))} kg`}
              contentStyle={{
                background: 'var(--surface)',
                color: 'var(--text)',
                borderColor: 'var(--border)',
              }}
            />
            <Line
              dataKey="weight"
              name="Registrado"
              stroke="var(--fat)"
              strokeWidth={0}
              dot={{ r: 4, fill: 'var(--fat)' }}
              isAnimationActive={false}
            />
            <Line
              dataKey="trend"
              name="Tendencia"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            {points.length > 0 && (
              <Line
                dataKey="expected"
                name="Esperado"
                stroke="var(--protein)"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted">
        {last
          ? `Último peso registrado: ${formatNumber(last.weightKg!)} kg, ${shortDate(last.date)}. `
          : 'Todavía no registraste peso. '}
        {trend != null && `Tendencia actual: ${formatNumber(trend)} kg. `}
        {expected !== null && `Peso esperado hoy: ${formatNumber(expected)} kg. `}
        {points.length > 0 &&
          goal?.targetWeightKg != null &&
          `Objetivo: ${formatNumber(goal.targetWeightKg)} kg. `}
        {visible.logs.filter((l) => l.weightKg !== null).length} registros de peso en el rango.
      </figcaption>
    </figure>
  );
}
