import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Food, Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { MEAL_LABELS } from '../../lib/macros';
import { useBarcodeLookup, useImportFood } from './api';
import { ApiError } from '../../lib/api';
import { FoodSearch } from './FoodSearch';
import { CustomFoodForm } from './CustomFoodForm';
import { QuantityStep } from './QuantityStep';
const LazyScannerView = lazy(() => import('../scanner/ScannerView'));

export function AddFoodSheet({
  date,
  meal,
  onClose,
  onAdd,
}: {
  date: string;
  meal: Meal;
  onClose: () => void;
  onAdd: (food: Food, grams: number) => void;
}) {
  const [step, setStep] = useState<'search' | 'custom' | 'quantity' | 'scan'>('search');
  const [food, setFood] = useState<Food | null>(null);
  const [error, setError] = useState<string>();
  const importing = useImportFood();
  const lookup = useBarcodeLookup();
  const [initialBarcode, setInitialBarcode] = useState<string>();
  const [scanError, setScanError] = useState<string>();
  const [canCreate, setCanCreate] = useState(false);
  const scanGeneration = useRef(0);
  const lookupInFlight = useRef(false);
  useEffect(
    () => () => {
      scanGeneration.current += 1;
    },
    [],
  );
  const selecting = useRef(false);
  const choose = (selected: Food) => {
    setFood(selected);
    setStep('quantity');
  };
  const scan = async (code: string) => {
    if (lookupInFlight.current) return;
    lookupInFlight.current = true;
    const generation = scanGeneration.current;
    const current = () => generation === scanGeneration.current;
    setScanError(undefined);
    setCanCreate(false);
    setInitialBarcode(code);
    try {
      let selected = await lookup.mutateAsync(code);
      if (!current()) return;
      if (!selected.id) selected = await importing.mutateAsync(selected.barcode ?? code);
      if (!current()) return;
      if (!selected.id) throw new Error('No se pudo importar el alimento.');
      choose(selected);
    } catch (failure) {
      if (!current()) return;
      if (failure instanceof ApiError && failure.status === 404) {
        setStep('custom');
      } else if (
        failure instanceof ApiError &&
        failure.status === 503 &&
        failure.code === 'off_unavailable'
      ) {
        setScanError(
          'Open Food Facts no responde. Probá de nuevo en un rato o creá el alimento a mano.',
        );
        setCanCreate(true);
      } else {
        setScanError(
          failure instanceof Error ? failure.message : 'No se pudo completar la búsqueda.',
        );
      }
    } finally {
      lookupInFlight.current = false;
    }
  };
  if (step === 'scan') {
    return (
      <Suspense
        fallback={
          <div
            role="status"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white"
          >
            Abriendo cámara…
          </div>
        }
      >
        <LazyScannerView
          onDetected={(code) => void scan(code)}
          onClose={() => {
            scanGeneration.current += 1;
            setStep('search');
          }}
          busy={lookup.isPending || importing.isPending}
          error={scanError}
          onCreate={canCreate ? () => setStep('custom') : undefined}
        />
      </Suspense>
    );
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={step === 'custom' ? 'Crear alimento' : 'Agregar alimento'}
      description={`${MEAL_LABELS[meal]} · ${date}`}
    >
      {step === 'search' && (
        <FoodSearch
          busy={importing.isPending}
          error={error}
          onScan={() => {
            setScanError(undefined);
            setCanCreate(false);
            setStep('scan');
          }}
          onCreate={() => {
            setInitialBarcode(undefined);
            setStep('custom');
          }}
          onSelect={(selected) => {
            if (selecting.current) return;
            setError(undefined);
            if (selected.id) {
              choose(selected);
              return;
            }
            if (!selected.barcode) {
              setError('Este alimento no tiene un código de barras válido.');
              return;
            }
            selecting.current = true;
            importing.mutate(selected.barcode, {
              onSuccess: (saved) => {
                if (saved.id) choose(saved);
                else setError('No se pudo importar el alimento.');
              },
              onError: (failure) => setError(failure.message),
              onSettled: () => {
                selecting.current = false;
              },
            });
          }}
        />
      )}
      {step === 'custom' && (
        <CustomFoodForm
          initialBarcode={initialBarcode}
          onBack={() => setStep('search')}
          onCreated={choose}
        />
      )}
      {step === 'quantity' && food && (
        <QuantityStep
          food={food}
          onBack={() => setStep('search')}
          onAdd={(grams) => onAdd(food, grams)}
        />
      )}
    </Sheet>
  );
}
