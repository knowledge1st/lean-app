import type { ShoppingItem } from '@lean/shared';
import { ShoppingItemRow } from './ShoppingItemRow';
export function ShoppingList({
  items,
  week,
  disabled,
}: {
  items: ShoppingItem[];
  week: string;
  disabled: boolean;
}) {
  const ordered = [
    ...items.filter((item) => !item.checked),
    ...items.filter((item) => item.checked),
  ];
  return (
    <ul aria-label="Lista de compras" className="min-w-0">
      {ordered.map((item) => (
        <ShoppingItemRow key={item.id} item={item} week={week} disabled={disabled} />
      ))}
    </ul>
  );
}
