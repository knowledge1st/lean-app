import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { MEALS, type ParseMealTextResponse } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { todayLocal } from '../../lib/date';
import { formatNumber, MEAL_LABELS } from '../../lib/macros';
import { formatDecimalInput } from '../foods/decimalInput';
import { useCreateEntriesBatch } from './api';
import { ReviewItem, itemGrams, itemKcal, type ReviewItemState } from './ReviewItem';
import { FoodPicker } from './FoodPicker';

export function useMealReview({
  date,
  onClose,
  onCancel,
  inputRef,
  busy,
  photo = false,
  textLogAi = false,
}: {
  date: string;
  onClose: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLElement | null>;
  busy: boolean;
  photo?: boolean;
  textLogAi?: boolean;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [proposal, setProposal] = useState<ParseMealTextResponse>();
  const [items, setItems] = useState<ReviewItemState[]>([]);
  const [picker, setPicker] = useState<{ key: string; create: boolean }>();
  const [confirming, setConfirming] = useState(false);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const mealSelectors = useRef(new Map<string, HTMLSelectElement>());
  const pendingFocus = useRef<string | null | undefined>(undefined);
  const keepButton = useRef<HTMLButtonElement>(null);
  const save = useCreateEntriesBatch(date, onClose);
  useEffect(() => {
    if (confirming) keepButton.current?.focus();
    else if (!picker && !busy) {
      if (reviewing) reviewTitle.current?.focus();
      else inputRef.current?.focus();
    }
  }, [reviewing, picker, confirming, busy, inputRef]);
  useLayoutEffect(() => {
    if (pendingFocus.current === undefined) return;
    const target =
      pendingFocus.current === null
        ? reviewTitle.current
        : mealSelectors.current.get(pendingFocus.current);
    pendingFocus.current = undefined;
    target?.focus();
  }, [items]);
  function close() {
    if (save.isPending) return;
    onCancel();
    if (proposal) setConfirming(true);
    else onClose();
  }
  function accept(response: ParseMealTextResponse) {
    setProposal(response);
    setItems(
      response.items.map((item) => ({
        ...item,
        included: item.match !== 'none',
        gramsInput: formatDecimalInput(item.grams),
      })),
    );
    setReviewing(true);
  }
  function update(key: string, changes: Partial<ReviewItemState>) {
    if (changes.meal && items.find((item) => item.key === key)?.meal !== changes.meal) {
      pendingFocus.current = key;
    }
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }
  function remove(key: string) {
    const displayedItems = MEALS.flatMap((meal) => items.filter((item) => item.meal === meal));
    const index = displayedItems.findIndex((item) => item.key === key);
    pendingFocus.current = displayedItems[index + 1]?.key ?? displayedItems[index - 1]?.key ?? null;
    setItems((current) => current.filter((item) => item.key !== key));
  }
  const included = items.filter((item) => item.included);
  const valid =
    included.length > 0 && included.every((item) => item.food?.id && itemGrams(item).success);
  const selected = items.find((item) => item.key === picker?.key);
  const footer =
    reviewing && proposal && !picker && !confirming ? (
      <div className="space-y-2 border-t border-border bg-surface py-3">
        <p aria-live="polite">
          Total: {formatNumber(included.reduce((total, item) => total + itemKcal(item), 0))} kcal
        </p>
        {save.isError && <p role="alert">{save.error.message}</p>}
        <Button
          className="w-full"
          disabled={!valid || save.isPending}
          onClick={() => {
            if (!valid) return;
            save.mutate({
              date,
              status: date <= todayLocal() ? 'eaten' : 'planned',
              items: included.map((item) => ({
                meal: item.meal,
                foodId: item.food!.id!,
                grams: itemGrams(item).data!,
              })),
            });
          }}
        >
          {save.isPending
            ? 'Guardando…'
            : `Guardar ${included.length} ${included.length === 1 ? 'alimento' : 'alimentos'}`}
        </Button>
        <Button variant="ghost" disabled={save.isPending} onClick={() => setReviewing(false)}>
          {photo ? 'Cambiar foto' : 'Editar texto'}
        </Button>
      </div>
    ) : undefined;
  const content = confirming ? (
    <div role="group" aria-label="Descartar propuesta" className="space-y-3">
      <p>¿Descartar lo interpretado?</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={onClose}>
          Sí, descartar
        </Button>
        <Button ref={keepButton} variant="secondary" onClick={() => setConfirming(false)}>
          Seguir revisando
        </Button>
      </div>
    </div>
  ) : selected && picker ? (
    <FoodPicker
      key={selected.key}
      item={selected}
      create={picker.create}
      onBack={() => setPicker(undefined)}
      onSelect={(food) => {
        update(selected.key, { food, match: 'exact', included: true });
        setPicker(undefined);
      }}
    />
  ) : reviewing && proposal ? (
    <div className="space-y-3">
      <h2 ref={reviewTitle} tabIndex={-1} className="text-lg font-semibold">
        Revisá los alimentos
      </h2>
      {photo && (
        <p role="status" className="text-sm text-warning">
          Las cantidades son estimadas a partir de la foto. Revisalas.
        </p>
      )}
      {proposal.warnings.map((warning, index) => (
        <p key={index} role="status" className="text-sm text-warning">
          {warning}
        </p>
      ))}
      {(photo || textLogAi) && (
        <p className="text-sm text-muted">
          Te quedan {proposal.remainingToday} {photo ? 'fotos' : 'interpretaciones'} hoy
        </p>
      )}
      <fieldset disabled={save.isPending} className="min-w-0">
        <legend className="sr-only">Alimentos interpretados</legend>
        {MEALS.map((meal) => {
          const group = items.filter((item) => item.meal === meal);
          return group.length ? (
            <section key={meal} aria-label={MEAL_LABELS[meal]}>
              <h3 className="font-semibold">{MEAL_LABELS[meal]}</h3>
              <ul>
                {group.map((item) => (
                  <ReviewItem
                    key={item.key}
                    item={item}
                    mealSelectRef={(element) => {
                      if (element) mealSelectors.current.set(item.key, element);
                      else mealSelectors.current.delete(item.key);
                    }}
                    onChange={(changes) => update(item.key, changes)}
                    onRemove={() => remove(item.key)}
                    onSearch={() => setPicker({ key: item.key, create: false })}
                    onCreate={() => setPicker({ key: item.key, create: true })}
                  />
                ))}
              </ul>
            </section>
          ) : null;
        })}
      </fieldset>
    </div>
  ) : null;
  return {
    proposal,
    reviewing,
    setReviewing,
    accept,
    close,
    footer,
    content,
    picking: Boolean(picker),
  };
}
