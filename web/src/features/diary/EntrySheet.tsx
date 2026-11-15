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
  const [grams, setGrams] = useState(String(entry.grams));
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
      <p className="mb-4 truncate">{entry.food.name}</p>
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
          <Button variant="danger" onClick={onDelete}>
            Borrar
          </Button>
          <Button type="submit" disabled={!changed}>
            Guardar
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
