import { useRef, useState } from 'react';
import type { Food, Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { MEAL_LABELS } from '../../lib/macros';
import { useImportFood } from './api';
import { FoodSearch } from './FoodSearch';
import { CustomFoodForm } from './CustomFoodForm';
import { QuantityStep } from './QuantityStep';
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
  const [step, setStep] = useState<'search' | 'custom' | 'quantity'>('search');
  const [food, setFood] = useState<Food | null>(null);
  const [error, setError] = useState<string>();
  const importing = useImportFood();
  const selecting = useRef(false);
  const choose = (selected: Food) => {
    setFood(selected);
    setStep('quantity');
  };
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
          onCreate={() => setStep('custom')}
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
      {step === 'custom' && <CustomFoodForm onBack={() => setStep('search')} onCreated={choose} />}
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
