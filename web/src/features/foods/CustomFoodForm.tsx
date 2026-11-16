import { useState } from 'react';
import { createFoodSchema, per100gFromServing, type Food } from '@lean/shared';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import { Button } from '../../components/ui/Button';
import { decimalValue, formatNumber } from '../../lib/macros';
import { useCreateFood } from './api';
const numericFields = [
  { key: 'kcal', label: 'Calorías', unit: 'kcal' },
  { key: 'protein', label: 'Proteína', unit: 'g' },
  { key: 'carbs', label: 'Carbohidratos', unit: 'g' },
  { key: 'fat', label: 'Grasa', unit: 'g' },
] as const;
export function CustomFoodForm({
  onBack,
  onCreated,
  initialBarcode,
  mode,
  onModeChange,
}: {
  initialBarcode?: string | undefined;
  onBack: () => void;
  onCreated: (food: Food) => void;
  mode: 'serving' | 'per100g';
  onModeChange: (mode: 'serving' | 'per100g') => void;
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
  const [submitted, setSubmitted] = useState(false);
  const mutation = useCreateFood();
  const update = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  const byServing = mode === 'serving';
  const servingG = fields.servingG.trim() ? decimalValue(fields.servingG) : undefined;
  const servingResult = createFoodSchema.shape.servingG.safeParse(servingG);
  const values = {
    kcal: decimalValue(fields.kcal),
    protein: decimalValue(fields.protein),
    carbs: decimalValue(fields.carbs),
    fat: decimalValue(fields.fat),
  };
  const inputErrors: Record<string, string> = {};
  if (byServing) {
    if (servingG === undefined) inputErrors.servingG = 'Indicá los gramos de la porción';
    else if (!servingResult.success) inputErrors.servingG = servingResult.error.issues[0]!.message;
    for (const { key } of numericFields) {
      if (!Number.isFinite(values[key]) || values[key] < 0)
        inputErrors[key] = 'Ingresá un número mayor o igual a 0';
    }
  }
  const canConvert = byServing && Object.keys(inputErrors).length === 0;
  // Validate each available value after conversion, even if another field is incomplete.
  // Input errors block submission for placeholders used by unconvertible fields.
  const storedValues = byServing
    ? per100gFromServing(
        Object.fromEntries(
          numericFields.map(({ key }) => [
            key,
            inputErrors.servingG || inputErrors[key] ? 0 : values[key],
          ]),
        ) as typeof values,
        servingG !== undefined && servingResult.success ? servingG : 100,
      )
    : values;
  const result = createFoodSchema.safeParse({
    ...fields,
    ...storedValues,
    barcode: initialBarcode,
    servingG,
    servingLabel: fields.servingLabel.trim() || (byServing ? '1 porción' : undefined),
  });
  const showPreview =
    (!byServing || canConvert) &&
    Object.values(storedValues).every((value) => Number.isFinite(value) && value >= 0);
  const nextErrors = { ...inputErrors };
  if (!result.success) {
    for (const issue of result.error.issues) {
      // The total has its own form alert and is suppressed by individual macro limits.
      if (issue.path.length === 0 && issue.message === 'La suma de macros no puede superar 100 g')
        continue;
      const key = String(issue.path[0] ?? 'form');
      nextErrors[key] ??= issue.message;
    }
  }
  if (byServing && !inputErrors.servingG) {
    const context = `Con una porción de ${formatNumber(servingG!)} g, eso da`;
    for (const { key, label } of numericFields) {
      if (storedValues[key] > (key === 'kcal' ? 900 : 100)) {
        nextErrors[key] =
          `${context} más de ${key === 'kcal' ? '900 kcal' : `100 g de ${label.toLowerCase()}`} cada 100 g. Revisá los gramos de la porción o los valores.`;
      }
    }
  }
  if (
    (!byServing || canConvert) &&
    [storedValues.protein, storedValues.carbs, storedValues.fat].every((value) => value <= 100) &&
    storedValues.protein + storedValues.carbs + storedValues.fat > 100 + 1e-8
  ) {
    nextErrors.macros = byServing
      ? `Con una porción de ${formatNumber(servingG!)} g, eso da más de 100 g de macros en total cada 100 g. Revisá los gramos de la porción o los valores.`
      : 'La suma de macros no puede superar 100 g';
  }
  const errors = submitted ? nextErrors : {};
  const servingInput = (
    <NumberInput
      label={byServing ? 'Gramos por porción' : 'Gramos por porción (opcional)'}
      unit="g"
      value={fields.servingG}
      onChange={(event) => update('servingG', event.target.value)}
      error={errors.servingG}
    />
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (mutation.isPending) return;
        setSubmitted(true);
        if (Object.keys(nextErrors).length || !result.success) return;
        mutation.mutate(result.data, { onSuccess: onCreated });
      }}
    >
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
      <div className="space-y-2" role="group" aria-label="Los valores de la etiqueta son:">
        <p className="text-sm font-medium">Los valores de la etiqueta son:</p>
        <div className="flex gap-2">
          {(
            [
              ['serving', 'Por porción'],
              ['per100g', 'Por 100 g'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={mode === value ? 'primary' : 'secondary'}
              aria-pressed={mode === value}
              onClick={() => {
                onModeChange(value);
                setSubmitted(false);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {byServing && servingInput}
      {numericFields.map(({ key, label, unit }) => (
        <NumberInput
          key={key}
          label={byServing ? `${label} por porción` : label}
          unit={unit}
          value={fields[key]}
          onChange={(event) => update(key, event.target.value)}
          error={errors[key]}
        />
      ))}
      {errors.macros && (
        <p role="alert" className="text-danger">
          {errors.macros}
        </p>
      )}
      <div aria-live="polite">
        {showPreview && (
          <p className="text-sm text-muted">
            Se guarda como {formatNumber(storedValues.kcal, 2)} kcal · P{' '}
            {formatNumber(storedValues.protein, 2)} g · C {formatNumber(storedValues.carbs, 2)} g ·
            G {formatNumber(storedValues.fat, 2)} g cada 100 g
          </p>
        )}
      </div>
      {!byServing && servingInput}
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
