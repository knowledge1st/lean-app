import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
export function ShoppingActions({
  checked,
  disabled,
  onGenerate,
  onClear,
}: {
  checked: number;
  disabled: boolean;
  onGenerate: () => void;
  onClear: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={disabled} onClick={onGenerate}>
          Actualizar desde el plan
        </Button>
        <Button variant="ghost" disabled={disabled || !checked} onClick={() => setConfirm(true)}>
          Quitar comprados
        </Button>
      </div>
      <Sheet open={confirm} onOpenChange={setConfirm} title={`¿Quitar ${checked} ítems comprados?`}>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            disabled={disabled || !checked}
            onClick={() => {
              setConfirm(false);
              onClear();
            }}
          >
            Quitar comprados
          </Button>
        </div>
      </Sheet>
    </>
  );
}
