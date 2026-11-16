import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useDaySummary } from './api';
import { useWater, useWaterMutation } from './activityApi';

const format = (value: number) => value.toLocaleString('es-AR');
type Addition = { sequence: number; ml: number; result: Promise<boolean> };
export function WaterCard({ date }: { date: string }) {
  return <WaterDay key={date} date={date} />;
}
function WaterDay({ date }: { date: string }) {
  const query = useWater(date);
  const summary = useDaySummary(date);
  const change = useWaterMutation(date);
  const stack = useRef<Addition[]>([]);
  const sequence = useRef(0);
  const [undoCount, setUndoCount] = useState(0);
  function add(ml: number) {
    const addition = { sequence: sequence.current++, ml, result: change(ml) };
    stack.current.push(addition);
    setUndoCount(stack.current.length);
    void addition.result.then((success) => {
      if (!success) {
        stack.current = stack.current.filter((item) => item !== addition);
        setUndoCount(stack.current.length);
      }
    });
  }
  const total = query.data?.ml ?? 0;
  const target = summary.data?.target?.waterMl;
  const text = target ? `${format(total)} de ${format(target)} ml` : `${format(total)} ml`;
  return (
    <Card className="min-w-0 space-y-3">
      <h2 className="text-lg font-semibold">Agua</h2>
      {query.isPending ? (
        <div aria-label="Cargando agua">
          <Skeleton />
        </div>
      ) : !query.data ? (
        <ErrorState
          message="No se pudo cargar el agua."
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <>
          <p aria-live="polite">{text}</p>
          <div
            role="progressbar"
            aria-label="Agua del día"
            aria-valuemin={0}
            aria-valuemax={target ?? 10000}
            aria-valuenow={Math.min(total, target ?? 10000)}
            aria-valuetext={text}
            className="h-2 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(total / (target ?? 10000), 1) * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => add(250)}>
              +250 ml
            </Button>
            <Button variant="secondary" onClick={() => add(500)}>
              +500 ml
            </Button>
            <Button
              variant="ghost"
              disabled={!undoCount}
              onClick={() => {
                const addition = stack.current.pop();
                if (!addition) return;
                setUndoCount(stack.current.length);
                void change(-addition.ml, addition.result).then((success) => {
                  if (!success)
                    void addition.result.then((saved) => {
                      if (saved) {
                        stack.current.push(addition);
                        stack.current.sort((a, b) => a.sequence - b.sequence);
                        setUndoCount(stack.current.length);
                      }
                    });
                });
              }}
            >
              Deshacer
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
