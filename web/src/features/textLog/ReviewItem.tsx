import { MEALS, gramsSchema, macrosForGrams, type ProposedItem } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { NumberInput } from '../../components/ui/NumberInput';
import { decimalValue, formatNumber, MEAL_LABELS } from '../../lib/macros';

export type ReviewItemState = ProposedItem & { included: boolean; gramsInput: string };
export function itemGrams(item: ReviewItemState) {
  return gramsSchema.safeParse(decimalValue(item.gramsInput));
}
export function itemKcal(item: ReviewItemState) {
  const grams = itemGrams(item);
  return item.food && grams.success ? macrosForGrams(item.food, grams.data).kcal : 0;
}
export function ReviewItem({
  item,
  onChange,
  onRemove,
  onSearch,
  onCreate,
}: {
  item: ReviewItemState;
  onChange: (changes: Partial<ReviewItemState>) => void;
  onRemove: () => void;
  onSearch: () => void;
  onCreate: () => void;
}) {
  const grams = itemGrams(item);
  return (
    <li className="min-w-0 space-y-2 border-b border-border py-3">
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={item.included}
          onChange={(event) => onChange({ included: event.target.checked })}
        />
        Incluir {item.said}
      </label>
      {item.food ? (
        <Button
          variant="ghost"
          className="max-w-full whitespace-normal break-words text-left"
          onClick={onSearch}
        >
          {item.match === 'approximate' ? '≈ ' : ''}
          {item.food.name}
        </Button>
      ) : (
        <>
          <p className="break-words">No encontré «{item.said}»</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onSearch}>
              Buscar
            </Button>
            <Button variant="secondary" onClick={onCreate}>
              Crear alimento
            </Button>
          </div>
        </>
      )}
      <p className="break-words text-sm text-muted">{item.said}</p>
      <NumberInput
        label={`Gramos de ${item.said}`}
        unit="g"
        value={item.gramsInput}
        onChange={(event) => onChange({ gramsInput: event.target.value, gramsEstimated: false })}
        error={!grams.success ? grams.error.issues[0]?.message : undefined}
      />
      <p className="text-sm text-muted">
        {item.gramsEstimated && 'estimado · '}
        {formatNumber(itemKcal(item))} kcal
      </p>
      <label className="block">
        Comida de {item.said}
        <select
          className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
          value={item.meal}
          onChange={(event) => onChange({ meal: event.target.value as ProposedItem['meal'] })}
        >
          {MEALS.map((meal) => (
            <option key={meal} value={meal}>
              {MEAL_LABELS[meal]}
            </option>
          ))}
        </select>
      </label>
      <Button variant="ghost" onClick={onRemove} aria-label={`Quitar ${item.said}`}>
        Quitar
      </Button>
    </li>
  );
}
