import { useState } from 'react';
import { createFoodSchema, type Food } from '@lean/shared';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import { Button } from '../../components/ui/Button';
import { decimalValue } from '../../lib/macros';
import { useCreateFood } from './api';
const numericFields = [
  { key: 'kcal', label: 'Calorías', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carbohidratos', unit: 'g' },
  { key: 'fat', label: 'Grasa', unit: 'g' },
  { key: 'servingG', label: 'Gramos por porción (opcional)', unit: 'g' },
] as const;
export function CustomFoodForm({
  onBack,
  onCreated,
  initialBarcode,
}: {
  initialBarcode?: string | undefined;
  onBack: () => void;
  onCreated: (food: Food) => void;
}) {
  const [fields, setFields] = useState({
    name: '',
    brand: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    servingG: '',
    servingLabel: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useCreateFood();
  const update = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        const result = createFoodSchema.safeParse({
          ...fields,
          barcode: initialBarcode,
          kcal: decimalValue(fields.kcal),
          protein: decimalValue(fields.protein),
          carbs: decimalValue(fields.carbs),
          fat: decimalValue(fields.fat),
          servingG: fields.servingG.trim() ? decimalValue(fields.servingG) : undefined,
          servingLabel: fields.servingLabel.trim() || undefined,
        });
        if (!result.success) {
          setErrors(
            Object.fromEntries(
              result.error.issues.map((issue) => [String(issue.path[0] ?? 'form'), issue.message]),
            ),
          );
          return;
        }
        setErrors({});
        mutation.mutate(result.data, { onSuccess: onCreated });
      }}
    >
      <p className="text-sm text-muted">Valores por 100 g</p>
      {initialBarcode && (
        <Input label="Código de barras" value={initialBarcode} readOnly error={errors.barcode} />
      )}
      <Input
        autoFocus
        label="Nombre"
        value={fields.name}
        maxLength={120}
        onChange={(event) => update('name', event.target.value)}
        error={errors.name}
      />
      <Input
        label="Marca (opcional)"
        value={fields.brand}
        maxLength={80}
        onChange={(event) => update('brand', event.target.value)}
        error={errors.brand}
      />
      {numericFields.map(({ key, label, unit }) => (
        <NumberInput
          key={key}
          label={label}
          unit={unit}
          value={fields[key]}
          onChange={(event) => update(key, event.target.value)}
          error={errors[key]}
        />
      ))}
      <Input
        label="Descripción de la porción (opcional)"
        maxLength={40}
        value={fields.servingLabel}
        onChange={(event) => update('servingLabel', event.target.value)}
        error={errors.servingLabel}
      />
      {errors.form && (
        <p role="alert" className="text-danger">
          {errors.form}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-danger">
          {mutation.error.message}
        </p>
      )}
      <div className="flex justify-between gap-3">
        <Button variant="ghost" disabled={mutation.isPending} onClick={onBack}>
          Volver
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : 'Guardar alimento'}
        </Button>
      </div>
    </form>
  );
}
