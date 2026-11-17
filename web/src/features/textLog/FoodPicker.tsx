import { useRef, useState } from 'react';
import type { Food, ProposedItem } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { FoodSearch } from '../foods/FoodSearch';
import { CustomFoodForm } from '../foods/CustomFoodForm';
import { useImportFood } from '../foods/api';

export function FoodPicker({
  item,
  create,
  onSelect,
  onBack,
}: {
  item: ProposedItem;
  create: boolean;
  onSelect: (food: Food) => void;
  onBack: () => void;
}) {
  const initialName = (item.searchQuery || item.said).trim();
  const [custom, setCustom] = useState(create);
  const [mode, setMode] = useState<'serving' | 'per100g'>('serving');
  const [error, setError] = useState<string>();
  const importing = useImportFood();
  const selecting = useRef(false);
  function choose(food: Food) {
    if (selecting.current) return;
    if (food.id) {
      onSelect(food);
      return;
    }
    if (!food.barcode) {
      setError('Este alimento no tiene un código de barras válido.');
      return;
    }
    selecting.current = true;
    setError(undefined);
    importing.mutate(food.barcode, {
      onSuccess: (saved) =>
        saved.id ? onSelect(saved) : setError('No se pudo importar el alimento.'),
      onError: (failure) => setError(failure.message),
      onSettled: () => {
        selecting.current = false;
      },
    });
  }
  return (
    <div className="space-y-3">
      <Button variant="ghost" disabled={importing.isPending} onClick={onBack}>
        Volver a la revisión
      </Button>
      {custom ? (
        <CustomFoodForm
          initialName={initialName.charAt(0).toUpperCase() + initialName.slice(1)}
          mode={mode}
          onModeChange={setMode}
          onCreated={choose}
          onBack={() => setCustom(false)}
        />
      ) : (
        <>
          {!!item.alternatives.length && (
            <div role="group" aria-label="Alternativas" className="flex flex-wrap gap-2">
              {item.alternatives.map((food) => (
                <Button
                  key={food.id ?? food.name}
                  variant="secondary"
                  disabled={importing.isPending}
                  onClick={() => choose(food)}
                >
                  {food.name}
                </Button>
              ))}
            </div>
          )}
          <FoodSearch
            initialQuery={item.searchQuery}
            onSelect={choose}
            onCreate={() => setCustom(true)}
            busy={importing.isPending}
            error={error}
          />
        </>
      )}
    </div>
  );
}
