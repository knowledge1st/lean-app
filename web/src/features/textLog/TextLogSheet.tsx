import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { MEALS, TEXT_LOG_MAX_CHARS, type Meal, type ParseMealTextResponse } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { todayLocal } from '../../lib/date';
import { formatNumber, MEAL_LABELS } from '../../lib/macros';
import { suggestedMeal } from '../diary/quickLog';
import { formatDecimalInput } from '../foods/decimalInput';
import { useCreateEntriesBatch, useParseMealText } from './api';
import { ReviewItem, itemGrams, itemKcal, type ReviewItemState } from './ReviewItem';
import { FoodPicker } from './FoodPicker';

export function TextLogSheet({
  date,
  defaultMeal,
  textLogAi = false,
  onClose,
}: {
  date: string;
  defaultMeal?: Meal;
  textLogAi?: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [proposal, setProposal] = useState<ParseMealTextResponse>();
  const [items, setItems] = useState<ReviewItemState[]>([]);
  const [picker, setPicker] = useState<{ key: string; create: boolean }>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const reviewTitle = useRef<HTMLHeadingElement>(null);
  const mealSelectors = useRef(new Map<string, HTMLSelectElement>());
  const pendingFocus = useRef<string | null | undefined>(undefined);
  const keepButton = useRef<HTMLButtonElement>(null);
  const textId = useId();
  const parse = useParseMealText();
  const save = useCreateEntriesBatch(date, onClose);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (confirming) keepButton.current?.focus();
    else if (!picker && !busy) {
      if (reviewing) reviewTitle.current?.focus();
      else textarea.current?.focus();
    }
  }, [reviewing, picker, confirming, busy]);
  useLayoutEffect(() => {
    if (pendingFocus.current === undefined) return;
    const target =
      pendingFocus.current === null
        ? reviewTitle.current
        : mealSelectors.current.get(pendingFocus.current);
    pendingFocus.current = undefined;
    target?.focus();
  }, [items]);
  function cancel() {
    request.current?.abort();
    request.current = undefined;
    setBusy(false);
  }
  function close() {
    if (save.isPending) return;
    cancel();
    if (proposal) setConfirming(true);
    else onClose();
  }
  async function interpret() {
    if (request.current || !text.trim() || text.length > TEXT_LOG_MAX_CHARS) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const response = await parse.mutateAsync({
        body: {
          text: text.trim(),
          date,
          defaultMeal: defaultMeal ?? suggestedMeal(new Date().getHours()),
        },
        signal: controller.signal,
      });
      if (request.current !== controller || controller.signal.aborted) return;
      setProposal(response);
      setItems(
        response.items.map((item) => ({
          ...item,
          included: item.match !== 'none',
          gramsInput: formatDecimalInput(item.grams),
        })),
      );
      setReviewing(true);
    } catch (failure) {
      if (request.current === controller && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'No se pudo interpretar el texto.');
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setBusy(false);
      }
    }
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
  return (
    <Sheet
      open
      title={picker ? 'Cambiar alimento' : 'Escribir lo que comí'}
      footer={
        reviewing && proposal && !picker && !confirming ? (
          <div className="space-y-2 border-t border-border bg-surface py-3">
            <p aria-live="polite">
              Total: {formatNumber(included.reduce((total, item) => total + itemKcal(item), 0))}{' '}
              kcal
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
              {save.isPending ? 'Guardando…' : `Guardar ${included.length} alimentos`}
            </Button>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setReviewing(false)}>
              Editar texto
            </Button>
          </div>
        ) : undefined
      }
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {confirming ? (
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
          {proposal.warnings.map((warning, index) => (
            <p key={index} role="status" className="text-sm text-warning">
              {warning}
            </p>
          ))}
          {textLogAi && (
            <p className="text-sm text-muted">
              Te quedan {proposal.remainingToday} interpretaciones hoy
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
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void interpret();
          }}
        >
          <label htmlFor={textId} className="block">
            ¿Qué comiste?
          </label>
          <textarea
            ref={textarea}
            autoFocus
            id={textId}
            maxLength={TEXT_LOG_MAX_CHARS}
            value={text}
            disabled={busy}
            aria-describedby={`${textId}-count`}
            rows={5}
            className="w-full resize-y rounded-xl border border-border bg-surface p-3"
            placeholder="Una pechuga con tomate y arroz de cena, café con leche y una medialuna de desayuno"
            onChange={(event) => setText(event.target.value.slice(0, TEXT_LOG_MAX_CHARS))}
          />
          <p id={`${textId}-count`} className="text-sm text-muted">
            {text.length}/{TEXT_LOG_MAX_CHARS}
          </p>
          {textLogAi && (
            <p className="text-sm text-muted">
              El texto se envía a un servicio de IA gratuito para interpretarlo. La app no lo
              guarda.
            </p>
          )}
          {textLogAi && proposal && (
            <p className="text-sm text-muted">
              Te quedan {proposal.remainingToday} interpretaciones hoy
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {busy && <p role="status">Interpretando… Puede tardar hasta medio minuto.</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !text.trim()}>
              {busy ? 'Interpretando…' : 'Interpretar'}
            </Button>
            {busy && (
              <Button variant="secondary" onClick={cancel}>
                Cancelar
              </Button>
            )}
            {proposal && !busy && (
              <Button variant="secondary" onClick={() => setReviewing(true)}>
                Volver a la revisión
              </Button>
            )}
          </div>
        </form>
      )}
    </Sheet>
  );
}
