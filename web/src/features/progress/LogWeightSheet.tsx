import { useState } from 'react';
import { localDateSchema, putBodyLogSchema } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import { decimalValue } from '../../lib/macros';
import { bodyFields, type ProgressLog } from './calc';
import { useLogWeight } from './api';

export function LogWeightSheet({
  logs,
  today,
  open,
  onOpenChange,
}: {
  logs: ProgressLog[];
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState(today);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      bodyFields.map((f) => {
        const value = [...logs].reverse().find((l) => l[f.key] !== null)?.[f.key];
        return [f.key, value != null ? String(value).replace('.', ',') : ''];
      }),
    ),
  );
  const [error, setError] = useState('');
  const mutation = useLogWeight();
  const field = (f: (typeof bodyFields)[number]) => (
    <NumberInput
      key={f.key}
      label={f.label}
      unit={f.unit}
      value={values[f.key] ?? ''}
      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
    />
  );
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar peso"
      description="Cargá tu peso o las medidas que quieras seguir."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!localDateSchema.safeParse(date).success || date > today) {
            setError('Elegí una fecha válida, hasta hoy.');
            return;
          }
          const parsed = putBodyLogSchema.safeParse(
            Object.fromEntries(
              bodyFields
                .filter((f) => values[f.key]?.trim())
                .map((f) => [f.key, decimalValue(values[f.key]!)]),
            ),
          );
          if (!parsed.success) {
            setError(
              `Revisá los valores. ${parsed.error.issues[0]?.message ?? 'Indicá al menos un campo.'}`,
            );
            return;
          }
          mutation.mutate({ date, values: parsed.data });
          onOpenChange(false);
        }}
      >
        <Input
          label="Fecha"
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
        {field(bodyFields[0])}
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-accent">
            Grasa y medidas
          </summary>
          <div className="grid gap-4 sm:grid-cols-2">{bodyFields.slice(1).map(field)}</div>
        </details>
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Guardar
        </Button>
      </form>
    </Sheet>
  );
}
