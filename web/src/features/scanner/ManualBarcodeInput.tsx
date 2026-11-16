import { useEffect, useRef, useState } from 'react';
import { barcodeSchema } from '@lean/shared';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function normalizeBarcode(input: string): string | null {
  const result = barcodeSchema.safeParse(input.replace(/[\s-]/g, ''));
  return result.success ? result.data : null;
}
export function ManualBarcodeInput({
  onSubmit,
  busy = false,
  autoFocus = false,
}: {
  onSubmit: (code: string) => void;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus && !busy) input.current?.focus();
  }, [autoFocus, busy]);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const code = normalizeBarcode(value);
        if (!code) {
          setError('Ingresá entre 8 y 14 dígitos.');
          return;
        }
        setError(undefined);
        onSubmit(code);
      }}
    >
      <Input
        ref={input}
        label="Código de barras"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={error}
        disabled={busy}
      />
      <Button type="submit" disabled={busy} className="w-full">
        Buscar
      </Button>
    </form>
  );
}
