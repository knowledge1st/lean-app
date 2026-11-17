import { useState } from 'react';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { parseLocalDateParam } from '../../lib/date';
export function CopyDaySheet({
  from,
  busy,
  onCopy,
  onClose,
}: {
  from: string;
  busy: boolean;
  onCopy: (to: string) => void;
  onClose: () => void;
}) {
  const [to, setTo] = useState('');
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Copiar este día a…"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (parseLocalDateParam(to) && to !== from) onCopy(to);
        }}
      >
        <label className="block">
          Día destino
          <input
            className="mt-2 block min-h-11 w-full rounded-xl border border-border bg-surface p-3"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        {to === from && <p role="alert">Elegí un día distinto al de origen.</p>}
        <Button type="submit" disabled={busy || !parseLocalDateParam(to) || to === from}>
          Copiar día
        </Button>
      </form>
    </Sheet>
  );
}
