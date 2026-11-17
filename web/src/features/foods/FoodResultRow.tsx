import { formatNumber } from '../../lib/macros';
import type { Food } from '@lean/shared';
export function FoodResultRow({
  food,
  onSelect,
  disabled,
}: {
  food: Food;
  onSelect: (food: Food) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(food)}
      className="flex min-h-11 w-full min-w-0 items-center gap-3 border-b border-border py-3 text-left disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span title={food.name} className="line-clamp-2 break-words font-medium">
          {food.name}
        </span>
        {food.brand && (
          <span title={food.brand} className="line-clamp-2 break-words text-sm text-muted">
            {food.brand}
          </span>
        )}
        <span className="text-sm text-muted">{formatNumber(food.kcal)} kcal / 100 g</span>
      </span>
      {food.source === 'off' && (
        <span
          title="Open Food Facts"
          aria-label="Open Food Facts"
          className="max-w-24 shrink-0 rounded bg-bg px-2 text-xs text-muted"
        >
          Open Food Facts
        </span>
      )}
    </button>
  );
}
