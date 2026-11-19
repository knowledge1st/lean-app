import { useEffect, useId, useRef, useState } from 'react';
import { TEXT_LOG_MAX_CHARS, type Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { suggestedMeal } from '../diary/quickLog';
import { useParseMealText } from './api';
import { useMealReview } from './useMealReview';

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
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | undefined>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const textId = useId();
  const parse = useParseMealText();
  const review = useMealReview({
    date,
    onClose,
    onCancel: cancel,
    inputRef: textarea,
    busy,
    textLogAi,
  });
  const { proposal, setReviewing } = review;
  useEffect(() => () => request.current?.abort(), []);
  function cancel() {
    request.current?.abort();
    request.current = undefined;
    setBusy(false);
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
      review.accept(response);
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
  return (
    <Sheet
      open
      title={review.picking ? 'Cambiar alimento' : 'Escribir lo que comí'}
      footer={review.footer}
      onOpenChange={(open) => {
        if (!open) review.close();
      }}
    >
      {review.content ?? (
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
