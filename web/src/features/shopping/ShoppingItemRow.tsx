import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ShoppingItem } from '@lean/shared';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import { Sheet } from '../../components/ui/Sheet';
import { formatQuantity, shoppingKey, useShoppingMutation, validateItem } from './api';

export function ShoppingItemRow({
  item,
  week,
  disabled = false,
}: {
  item: ShoppingItem;
  week: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const client = useQueryClient();
  const toggle = useShoppingMutation(week, 'toggle');
  const edit = useShoppingMutation(week, 'edit');
  const remove = useShoppingMutation(week, 'delete');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const unavailable = disabled || item.id.startsWith('temp-');
  return (
    <li className="flex min-h-12 min-w-0 items-center gap-1 border-b border-border">
      <label
        className={`flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 ${item.checked ? 'text-muted' : ''}`}
      >
        <span className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            aria-label={item.label}
            checked={item.checked}
            disabled={unavailable}
            className="size-7 accent-accent"
            onChange={() =>
              toggle.mutate({
                kind: 'toggle',
                id: item.id,
                changes: {
                  checked: !(
                    client
                      .getQueryData<ShoppingItem[]>(shoppingKey(week))
                      ?.find((current) => current.id === item.id)?.checked ?? item.checked
                  ),
                },
              })
            }
          />
        </span>
        <span className={`min-w-0 flex-1 break-words ${item.checked ? 'line-through' : ''}`}>
          {item.label}
        </span>
        <span className="shrink-0 text-sm">{formatQuantity(item.totalGrams)}</span>
      </label>
      <Button
        variant="ghost"
        className="shrink-0 px-2"
        aria-label={`Opciones de ${item.label}`}
        disabled={unavailable}
        onClick={() => {
          setEditing(false);
          setOpen(true);
        }}
      >
        ⋯
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={editing ? 'Editar ítem' : item.label}>
        {editing ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const invalid = validateItem(label, quantity);
              setError(invalid);
              if (invalid) return;
              edit.mutate(
                {
                  kind: 'edit',
                  id: item.id,
                  changes: {
                    label: label.trim(),
                    quantity: quantity.trim() ? Number(quantity.replace(',', '.')) : null,
                  },
                },
                { onSuccess: () => setOpen(false) },
              );
            }}
          >
            <Input
              label="Nombre"
              error={error && validateItem(label, '') ? error : undefined}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <NumberInput
              label="Cantidad en gramos (opcional)"
              unit="g"
              error={error && !validateItem(label, '') ? error : undefined}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <Button type="submit" disabled={edit.isPending}>
              Guardar
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            {item.manual && (
              <Button
                variant="secondary"
                onClick={() => {
                  setLabel(item.label);
                  setQuantity(
                    item.totalGrams === null
                      ? ''
                      : item.totalGrams.toLocaleString('es-AR', {
                          useGrouping: false,
                          maximumFractionDigits: 1,
                        }),
                  );
                  setError(null);
                  setEditing(true);
                }}
              >
                Editar
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => {
                setOpen(false);
                const undo = new AbortController();
                remove.mutate({ kind: 'delete', id: item.id, undo: undo.signal });
                toast(`Borraste ${item.label}`, {
                  label: 'Deshacer',
                  onAction: () => undo.abort(),
                });
              }}
            >
              Borrar
            </Button>
          </div>
        )}
      </Sheet>
    </li>
  );
}
