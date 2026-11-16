import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumber } from '../../lib/macros';
import { shortDate, timestamp, type Measurement, type ProgressLog } from './calc';
export default function MeasurementChart({
  logs,
  measurement,
}: {
  logs: ProgressLog[];
  measurement: Measurement;
}) {
  const data = logs
    .filter((l) => l[measurement.key] !== null)
    .map((l) => ({ time: timestamp(l.date), value: l[measurement.key] }));
  return (
    <figure className="min-w-0 space-y-2">
      <div aria-hidden="true" className="h-60 min-w-0">
        <ResponsiveContainer width="100%" height={240} minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 12, right: 22, bottom: 8, left: 0 }}
            accessibilityLayer={false}
          >
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickCount={3}
              tickFormatter={shortDate}
              minTickGap={30}
              stroke="var(--muted)"
              tick={{ fontSize: 12 }}
            />
            <YAxis
              width={48}
              domain={['dataMin - 1', 'dataMax + 1']}
              tickFormatter={(v) => formatNumber(Number(v))}
              tickCount={4}
              stroke="var(--muted)"
            />
            <Tooltip
              labelFormatter={(v) => shortDate(Number(v))}
              formatter={(v) => `${formatNumber(Number(v))} ${measurement.unit}`}
              contentStyle={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            />
            <Line
              dataKey="value"
              name={measurement.label}
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-sm text-muted">
        {measurement.label}:{' '}
        {data
          .map((d) => `${shortDate(d.time)}: ${formatNumber(d.value!)} ${measurement.unit}`)
          .join('; ')}
        . {data.length} registros.
      </figcaption>
    </figure>
  );
}
