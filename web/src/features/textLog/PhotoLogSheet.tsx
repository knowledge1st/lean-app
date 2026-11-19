import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { suggestedMeal } from '../diary/quickLog';
import { useParseMealPhoto } from './api';
import { preparePhoto } from './photo';
import { useMealReview } from './useMealReview';

export function PhotoLogSheet({
  date,
  defaultMeal,
  onClose,
}: {
  date: string;
  defaultMeal?: Meal;
  onClose: () => void;
}) {
  const [image, setImage] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const inputButton = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | undefined>(undefined);
  const preparation = useRef(0);
  const parse = useParseMealPhoto();
  const review = useMealReview({
    date,
    onClose,
    onCancel: cancel,
    inputRef: inputButton,
    busy: busy || preparing,
    photo: true,
  });
  useEffect(
    () => () => {
      request.current?.abort();
      preparation.current++;
    },
    [],
  );

  function cancel() {
    request.current?.abort();
    request.current = undefined;
    preparation.current++;
    setPreparing(false);
    setBusy(false);
  }
  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const version = ++preparation.current;
    setPreparing(true);
    setError(undefined);
    try {
      const prepared = await preparePhoto(file);
      if (version === preparation.current) setImage(prepared);
    } catch (failure) {
      if (version === preparation.current)
        setError(
          failure instanceof Error ? failure.message : 'No pude leer la foto. Probá con otra.',
        );
    } finally {
      if (version === preparation.current) setPreparing(false);
    }
  }
  async function interpret() {
    if (!image || preparing || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(undefined);
    try {
      const response = await parse.mutateAsync({
        body: { image, date, defaultMeal: defaultMeal ?? suggestedMeal(new Date().getHours()) },
        signal: controller.signal,
      });
      if (request.current === controller && !controller.signal.aborted) review.accept(response);
    } catch (failure) {
      if (request.current === controller && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : 'No se pudo interpretar la foto.');
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
      title={review.picking ? 'Cambiar alimento' : 'Cargar con foto'}
      footer={review.footer}
      onOpenChange={(open) => {
        if (!open) review.close();
      }}
    >
      {review.content ?? (
        <div className="space-y-3">
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            aria-label="Sacar foto"
            onChange={(event) => void choosePhoto(event)}
          />
          <input
            ref={gallery}
            type="file"
            accept="image/*"
            hidden
            aria-label="Elegir de la galería"
            onChange={(event) => void choosePhoto(event)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              ref={inputButton}
              autoFocus
              variant="secondary"
              disabled={busy || preparing}
              onClick={() => camera.current?.click()}
            >
              Sacar foto
            </Button>
            <Button
              variant="secondary"
              disabled={busy || preparing}
              onClick={() => gallery.current?.click()}
            >
              Elegir de la galería
            </Button>
          </div>
          {preparing && <p role="status">Preparando la foto…</p>}
          {image && (
            <img
              src={image}
              alt="Foto elegida"
              className="max-h-72 w-full rounded-xl object-contain"
            />
          )}
          <p className="text-sm text-muted">
            La foto se envía a un servicio de IA gratuito para interpretarla. La app no la guarda.
          </p>
          {error && <p role="alert">{error}</p>}
          {busy && <p role="status">Interpretando… Puede tardar hasta un minuto.</p>}
          <div className="flex flex-wrap gap-2">
            {image && (
              <>
                <Button disabled={busy || preparing} onClick={() => void interpret()}>
                  {busy ? 'Interpretando…' : 'Interpretar'}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || preparing}
                  onClick={() => gallery.current?.click()}
                >
                  Cambiar foto
                </Button>
              </>
            )}
            {busy && (
              <Button variant="secondary" onClick={cancel}>
                Cancelar
              </Button>
            )}
            {review.proposal && !busy && !preparing && (
              <Button variant="secondary" onClick={() => review.setReviewing(true)}>
                Volver a la revisión
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
