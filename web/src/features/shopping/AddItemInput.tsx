import { useEffect, useState, type RefObject } from 'react';
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
  const [focused, setFocused] = useState(false);
  const [keyboardBottom, setKeyboardBottom] = useState<number>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!focused || !viewport) return;
    const update = () =>
      setKeyboardBottom(Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop)));
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      setKeyboardBottom(undefined);
    };
  }, [focused]);
  const add = useShoppingMutation(week, 'add');
  useEffect(() => {
    if (add.isSuccess) inputRef.current?.focus();
  }, [add.isSuccess, inputRef]);
  return (
    <form
      style={focused && keyboardBottom !== undefined ? { bottom: keyboardBottom } : undefined}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mx-auto w-full max-w-3xl border-t border-border bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const invalid = validateItem(label, quantity);
        setError(invalid);
        if (invalid || disabled || add.isPending) return;
        add.mutate(
          {
            kind: 'add',
            item: {
              id: `temp-${crypto.randomUUID()}`,
              foodId: null,
              manual: true,
              checked: false,
              label: label.trim(),
              totalGrams: quantity.trim() ? Number(quantity.replace(',', '.')) : null,
            },
          },
          {
            onSuccess: () => {
              setLabel('');
              setQuantity('');
            },
          },
        );
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2">
        <Input
          ref={inputRef}
          aria-label="Agregar a mano"
          error={error && validateItem(label, '') ? error : undefined}
          placeholder="¿Qué necesitás?"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={disabled || add.isPending}
        />
        <NumberInput
          aria-label="Cantidad en gramos (opcional)"
          unit="g"
          style={{ paddingRight: '1.5rem' }}
          error={error && !validateItem(label, '') ? error : undefined}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={disabled || add.isPending}
        />
        <Button type="submit" disabled={disabled || add.isPending}>
          Agregar
        </Button>
      </div>
    </form>
  );
}
