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
  const [view, setView] = useState<'actions' | 'confirm' | null>(null);
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setView('actions')}>
        Acciones
      </Button>
      <Sheet
        open={view !== null}
        onOpenChange={(open) => !open && setView(null)}
        title={view === 'confirm' ? `¿Quitar ${checked} ítems comprados?` : 'Acciones'}
      >
        {view === 'confirm' ? (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setView(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={disabled || !checked}
              onClick={() => {
                setView(null);
                onClear();
              }}
            >
              Quitar comprados
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => {
                setView(null);
                onGenerate();
              }}
            >
              Actualizar desde el plan
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || !checked}
              onClick={() => setView('confirm')}
            >
              Quitar comprados
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
