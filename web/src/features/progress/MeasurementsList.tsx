import { ChartBoundary } from './ChartBoundary';
import { lazy, Suspense, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatNumber } from '../../lib/macros';
import { measurements, signedKg, type Measurement, type ProgressLog } from './calc';
const MeasurementChart = lazy(() => import('./MeasurementChart'));
export function MeasurementsList({ logs }: { logs: ProgressLog[] }) {
  const [selected, setSelected] = useState<Measurement['key'] | null>(null);
  const available = measurements.filter((m) => logs.some((l) => l[m.key] !== null));
  if (!available.length)
    return (
      <p className="text-sm text-muted">
        Cargá tus medidas desde «Registrar peso» para seguir sus cambios.
      </p>
    );
  return (
    <ul className="min-w-0 divide-y divide-border">
      {available.map((m) => {
        const values = logs.filter((l) => l[m.key] !== null);
        const first = values[0]![m.key]!;
        const last = values.at(-1)![m.key]!;
        return (
          <li key={m.key} className="min-w-0 py-2">
            <Button
              variant="ghost"
              className="w-full flex-wrap justify-between text-left"
              aria-expanded={selected === m.key}
              aria-controls={`chart-${m.key}`}
              onClick={() => setSelected(selected === m.key ? null : m.key)}
            >
              <span>{m.label}</span>
              <span className="text-sm text-text">
                {formatNumber(last)} {m.unit} · {signedKg(last - first)} {m.unit} desde el inicio
              </span>
            </Button>
            {selected === m.key && (
              <div id={`chart-${m.key}`}>
                <ChartBoundary>
                  <Suspense fallback={<Skeleton className="h-60!" />}>
                    <MeasurementChart logs={logs} measurement={m} />
                  </Suspense>
                </ChartBoundary>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
