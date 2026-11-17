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
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-3xl border-t border-border bg-surface p-3"
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
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
        <Input
          ref={inputRef}
          aria-label="Agregar a mano"
          aria-invalid={!!error}
          aria-describedby={error ? 'shopping-add-error' : undefined}
          placeholder="¿Qué necesitás?"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={disabled}
        />
        <NumberInput
          aria-label="Cantidad en gramos (opcional)"
          placeholder="g"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled}>
          Agregar
        </Button>
      </div>
      {error && (
        <p
          id="shopping-add-error"
          role="alert"
          className="absolute inset-x-0 bottom-full border-t border-border bg-surface px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </form>
  );
}
