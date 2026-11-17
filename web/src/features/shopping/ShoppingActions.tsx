import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { formatNumber } from '../../lib/macros';
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
  const [view, setView] = useState<'actions' | 'confirm' | 'generate' | null>(null);
  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setView('actions')}>
        Acciones
      </Button>
      <Sheet
        open={view !== null}
        onOpenChange={(open) => !open && setView(null)}
        title={
          view === 'confirm' ? `¿Quitar ${formatNumber(checked, 0)} ítems comprados?` : 'Acciones'
        }
      >
        {view === 'generate' ? (
          <div className="space-y-3">
            <p>
              Se recalcula la lista desde el plan. Pueden desaparecer los ítems que ya no estén
              planificados. Los que agregaste a mano se conservan.
            </p>
            <Button variant="secondary" onClick={() => setView(null)}>
              Cancelar
            </Button>
            <Button
              disabled={disabled}
              onClick={() => {
                setView(null);
                onGenerate();
              }}
            >
              Actualizar
            </Button>
          </div>
        ) : view === 'confirm' ? (
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
                setView('generate');
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
