import type { DaySummary, Entry } from '@lean/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MEAL_LABELS } from '../../lib/macros';
import { EntryRow } from './EntryRow';
export function MealSection({
  meal,
  disabled,
  onAdd,
  onEdit,
  onEat,
}: {
  meal: DaySummary['meals'][number];
  disabled?: boolean | undefined;
  onAdd: () => void;
  onEdit: (entry: Entry) => void;
  onEat: (entry: Entry) => void;
}) {
  return (
    <Card className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{MEAL_LABELS[meal.meal]}</h2>
        <span>{meal.eaten.kcal} kcal</span>
      </div>
      {Object.values(meal.planned).some((value) => value > 0) && (
        <p className="mb-2 text-sm text-muted">Planificado: {meal.planned.kcal} kcal</p>
      )}
      {meal.entries.length ? (
        meal.entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            disabled={disabled}
            onEdit={onEdit}
            onEat={onEat}
          />
        ))
      ) : (
        <p className="py-3 text-sm text-muted">Sin alimentos</p>
      )}
      <Button
        variant="ghost"
        disabled={disabled}
        aria-label={`Agregar a ${MEAL_LABELS[meal.meal]}`}
        onClick={onAdd}
      >
        + Agregar
      </Button>
    </Card>
  );
}
