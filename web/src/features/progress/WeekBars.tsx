import {
  Bar,
  ComposedChart,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Entry, WeekSummary } from '@lean/shared';
import { formatNumber } from '../../lib/macros';
import { buildWeekBars, shortDate } from './calc';
export default function WeekBars({ summary, entries }: { summary: WeekSummary; entries: Entry[] }) {
  const data = buildWeekBars(summary, entries);
  return (
    <figure className="min-w-0 space-y-3">
      <p>{data.loggedDays} de 7 días registrados</p>
      <p>
        Promedio de proteína:{' '}
        {data.avgProteinG === null ? '—' : `${formatNumber(data.avgProteinG)} g por día registrado`}
      </p>
      <p className="text-sm text-muted">Barras: kcal comidas. Línea punteada: meta diaria.</p>
      <div aria-hidden="true" className="h-60 min-w-0">
        <ResponsiveContainer width="100%" height={240} minWidth={0}>
          <ComposedChart
            data={data.bars}
            margin={{ top: 12, right: 12, bottom: 8, left: 0 }}
            accessibilityLayer={false}
          >
            <XAxis dataKey="label" stroke="var(--muted)" />
            <YAxis
              width={48}
              tickFormatter={(v) => formatNumber(Number(v), 0)}
              tickCount={4}
              stroke="var(--muted)"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={(_label, payload) =>
                payload[0]?.payload ? shortDate(String(payload[0].payload.date)) : ''
              }
              formatter={(v) => `${formatNumber(Number(v), 0)} kcal`}
              contentStyle={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            />
            <Bar dataKey="kcal" name="Comidas" isAnimationActive={false}>
              {data.bars.map((b) => (
                <Cell key={b.date} fill={b.over ? 'var(--warning)' : 'var(--accent)'} />
              ))}
            </Bar>
            <Line
              dataKey="targetKcal"
              name="Meta"
              stroke="var(--protein)"
              strokeDasharray="5 5"
              strokeWidth={2}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {data.bars
          .map(
            (b) =>
              `${shortDate(b.date)}: ${formatNumber(b.kcal, 0)} kcal, ${b.targetKcal === null ? 'sin meta' : `meta ${formatNumber(b.targetKcal, 0)} kcal`}`,
          )
          .join('; ')}
        .
      </figcaption>
    </figure>
  );
}
