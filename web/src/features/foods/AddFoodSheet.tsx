import { useEffect, useRef, useState } from 'react';
import type { Food, Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { MEAL_LABELS } from '../../lib/macros';
import { useBarcodeLookup, useImportFood } from './api';
import { ApiError } from '../../lib/api';
import { FoodSearch } from './FoodSearch';
import { CustomFoodForm } from './CustomFoodForm';
import { QuantityStep } from './QuantityStep';
import { ScannerView } from '../scanner/ScannerView';

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
  const [valuesMode, setValuesMode] = useState<'serving' | 'per100g'>('serving');
  const [error, setError] = useState<string>();
  const importing = useImportFood();
  const lookup = useBarcodeLookup();
  const scanImport = useImportFood();
  const [scanBusy, setScanBusy] = useState(false);
  const [initialBarcode, setInitialBarcode] = useState<string>();
  const [scanError, setScanError] = useState<string>();
  const [canCreate, setCanCreate] = useState(false);
  const scanGeneration = useRef(0);
  const lookupInFlight = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      scanGeneration.current += 1;
      lookupInFlight.current?.abort();
      lookupInFlight.current = undefined;
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
    const controller = new AbortController();
    lookupInFlight.current = controller;
    setScanBusy(true);
    const generation = scanGeneration.current;
    const current = () => generation === scanGeneration.current && !controller.signal.aborted;
    setScanError(undefined);
    setCanCreate(false);
    setInitialBarcode(code);
    try {
      let selected = await lookup.mutateAsync({ code, signal: controller.signal });
      if (!current()) return;
      if (!selected.id) selected = await scanImport.mutateAsync(selected.barcode ?? code);
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
      if (lookupInFlight.current === controller) {
        lookupInFlight.current = undefined;
        setScanBusy(false);
      }
    }
  };
  const closeScanner = () => {
    scanGeneration.current += 1;
    lookupInFlight.current?.abort();
    lookupInFlight.current = undefined;
    setScanBusy(false);
    setStep('search');
  };
  if (step === 'scan') {
    return (
      <ScannerView
        onDetected={(code) => void scan(code)}
        onClose={closeScanner}
        busy={scanBusy}
        error={scanError}
        onCreate={canCreate ? () => setStep('custom') : undefined}
      />
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
          mode={valuesMode}
          onModeChange={setValuesMode}
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
