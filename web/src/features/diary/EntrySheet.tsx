import { formatDecimalInput } from '../foods/decimalInput';
import { useState } from 'react';
import { MEALS, gramsSchema, type Entry } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { NumberInput } from '../../components/ui/NumberInput';
import { decimalValue, MEAL_LABELS } from '../../lib/macros';
import type { EntryChanges } from './optimistic';
export function EntrySheet({
  entry,
  onClose,
  onSave,
  onDelete,
}: {
  entry: Entry;
  onClose: () => void;
  onSave: (changes: EntryChanges) => void;
  onDelete: () => void;
}) {
  const [grams, setGrams] = useState(formatDecimalInput(entry.grams));
  const [confirming, setConfirming] = useState(false);
  const [meal, setMeal] = useState(entry.meal);
  const result = gramsSchema.safeParse(decimalValue(grams));
  const changed = result.success && (result.data !== entry.grams || meal !== entry.meal);
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Editar alimento"
    >
      <div className="mb-4 space-y-1 break-words">
        <p>{entry.food.name}</p>
        {entry.food.brand && <p className="text-muted">{entry.food.brand}</p>}
        {entry.food.servingLabel && <p className="text-sm text-muted">{entry.food.servingLabel}</p>}
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!result.success || !changed) return;
          onSave({
            ...(result.data !== entry.grams ? { grams: result.data } : {}),
            ...(meal !== entry.meal ? { meal } : {}),
          });
        }}
      >
        <NumberInput
          label="Gramos"
          unit="g"
          value={grams}
          onChange={(event) => setGrams(event.target.value)}
          error={!result.success ? result.error.issues[0]?.message : undefined}
        />
        <fieldset>
          <legend className="mb-2">Comida</legend>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((item) => (
              <label
                key={item}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3"
              >
                <input
                  type="radio"
                  name="meal"
                  checked={item === meal}
                  onChange={() => setMeal(item)}
                />
                {MEAL_LABELS[item]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-between gap-3">
          {confirming ? (
            <div className="min-w-0 space-y-2">
              <p className="break-words">¿Borrar {entry.food.name}?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={onDelete}>
                  Sí, borrar
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Borrar
            </Button>
          )}
          <Button type="submit" disabled={!changed}>
            Guardar
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
