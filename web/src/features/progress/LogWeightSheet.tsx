import { useRef, useState } from 'react';
import { localDateSchema, putBodyLogSchema } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import { decimalValue, formatNumber } from '../../lib/macros';
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
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  function focusField(key: string) {
    if (key !== 'date' && key !== 'weightKg' && detailsRef.current) detailsRef.current.open = true;
    formRef.current?.querySelector<HTMLInputElement>(`[name="${key}"]`)?.focus();
  }
  const mutation = useLogWeight();
  const field = (f: (typeof bodyFields)[number]) => (
    <NumberInput
      key={f.key}
      disabled={mutation.isPending}
      label={f.label}
      name={f.key}
      error={errors[f.key]}
      placeholder={(() => {
        const previous = [...logs].reverse().find((log) => log[f.key] !== null)?.[f.key];
        return previous == null ? undefined : `Último: ${formatNumber(previous)} ${f.unit}`;
      })()}
      unit={f.unit}
      value={values[f.key] ?? ''}
      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
    />
  );
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
      title="Registrar peso"
      description="Cargá tu peso o las medidas que quieras seguir."
    >
      <form
        ref={formRef}
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErrors({});
          setError('');
          if (!localDateSchema.safeParse(date).success || date > today) {
            setErrors({ date: 'Elegí una fecha válida, hasta hoy.' });
            focusField('date');
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
            const fieldErrors = Object.fromEntries(
              parsed.error.issues.map((issue) => [
                String(issue.path[0] ?? 'weightKg'),
                issue.message,
              ]),
            );
            setErrors(fieldErrors);
            focusField(Object.keys(fieldErrors)[0]!);
            setError(
              `Revisá los valores. ${parsed.error.issues[0]?.message ?? 'Indicá al menos un campo.'}`,
            );
            return;
          }
          mutation.mutate(
            { date, values: parsed.data },
            {
              onSuccess: () => onOpenChange(false),
              onError: () =>
                setError('No se pudo guardar. Revisá tu conexión y volvé a intentarlo.'),
            },
          );
        }}
      >
        <Input
          label="Fecha"
          name="date"
          disabled={mutation.isPending}
          error={errors.date}
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
        />
        {field(bodyFields[0])}
        <details ref={detailsRef}>
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
