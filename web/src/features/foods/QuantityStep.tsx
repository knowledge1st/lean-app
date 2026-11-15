import { useState } from 'react';
import { gramsSchema, macrosForGrams, roundMacros, type Food } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { NumberInput } from '../../components/ui/NumberInput';
import { decimalValue, formatNumber, MACROS } from '../../lib/macros';
export function QuantityStep({
  food,
  onBack,
  onAdd,
}: {
  food: Food;
  onBack: () => void;
  onAdd: (grams: number) => void;
}) {
  const [value, setValue] = useState(String(food.servingG ?? 100));
  const result = gramsSchema.safeParse(decimalValue(value));
  const macros = result.success ? roundMacros(macrosForGrams(food, result.data)) : null;
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h3 className="truncate font-semibold">{food.name}</h3>
        {food.brand && <p className="truncate text-muted">{food.brand}</p>}
      </div>
      <NumberInput
        label="Gramos"
        unit="g"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={!result.success ? result.error.issues[0]?.message : undefined}
      />
      {food.servingG && (
        <div className="flex flex-wrap gap-2">
          {[0.5, 1, 2].map((multiplier) => {
            const grams = Math.round(food.servingG! * multiplier * 10) / 10;
            return (
              <Button
                key={multiplier}
                variant="secondary"
                className="max-w-full min-w-0"
                onClick={() => setValue(String(grams))}
              >
                <span className="truncate">
                  {multiplier === 0.5
                    ? '½ porción'
                    : `${multiplier} ${multiplier === 1 ? 'porción' : 'porciones'}`}{' '}
                  · {food.servingLabel}
                </span>
                <span className="shrink-0">({formatNumber(grams)} g)</span>
              </Button>
            );
          })}
        </div>
      )}
      <div aria-live="polite" className="space-y-2">
        {macros ? (
          <>
            <p className="text-xl font-semibold">{formatNumber(macros.kcal)} kcal</p>
            {MACROS.map(({ key, label, color }) => (
              <p key={key} style={{ color }}>
                {label}: {formatNumber(macros[key])} g
              </p>
            ))}
          </>
        ) : (
          <p className="text-muted">Ingresá una cantidad válida para ver las macros.</p>
        )}
      </div>
      <div className="flex justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          Volver
        </Button>
        <Button
          disabled={!result.success}
          onClick={() => {
            if (result.success) onAdd(result.data);
          }}
        >
          Agregar
        </Button>
      </div>
    </div>
  );
}
