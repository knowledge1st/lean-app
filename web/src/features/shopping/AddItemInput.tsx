import { useState, type RefObject } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { NumberInput } from '../../components/ui/NumberInput';
import { useShoppingMutation, validateItem } from './api';

export function AddItemInput({
  week,
  inputRef,
  disabled,
}: {
  week: string;
  inputRef: RefObject<HTMLInputElement | null>;
  disabled: boolean;
}) {
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useShoppingMutation(week, 'add');
  return (
    <form
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-3xl space-y-2 border-t border-border bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const invalid = validateItem(label, quantity);
        setError(invalid);
        if (invalid || disabled) return;
        add.mutate({
          kind: 'add',
          item: {
            id: `temp-${crypto.randomUUID()}`,
            foodId: null,
            manual: true,
            checked: false,
            label: label.trim(),
            totalGrams: quantity.trim() ? Number(quantity.replace(',', '.')) : null,
          },
        });
        setLabel('');
        setQuantity('');
        inputRef.current?.focus();
      }}
    >
      <Input
        ref={inputRef}
        label="Agregar a mano"
        placeholder="¿Qué necesitás?"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        disabled={disabled}
      />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <NumberInput
            aria-label="Cantidad en gramos (opcional)"
            placeholder="Gramos (opcional)"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled}>
          Agregar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
