import { useEffect, useId, useState } from 'react';
import {
  REMINDER_MESSAGE_MAX,
  updateRemindersSchema,
  type Reminder,
  type ReminderSlot,
} from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { sendTestPush, useReminders, useSaveReminders } from './api';
import { usePushDevice, type DeviceState } from './usePushDevice';

export const REMINDER_LABELS: Record<ReminderSlot, string> = {
  breakfast: 'Desayuno',
  lunch: 'Almuerzo',
  afternoon_snack: 'Merienda',
  dinner: 'Cena',
  snack: 'Snack',
  day_close: 'Cierre del día',
};
const HINTS: Partial<Record<ReminderSlot, string>> = {
  day_close: 'Solo si ese día no cargaste nada.',
};
type Draft = Pick<Reminder, 'slot' | 'enabled' | 'time'> & { message: string };
const toDraft = (items: Reminder[]): Draft[] =>
  items.map(({ slot, enabled, time, message }) => ({
    slot,
    enabled,
    time,
    message: message ?? '',
  }));

const DEVICE_TEXT: Record<Exclude<DeviceState, 'loading' | 'off' | 'on'>, string> = {
  'needs-install':
    'En iPhone, primero agregá Lean a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ese ícono.',
  unsupported: 'Este navegador no admite notificaciones.',
  denied:
    'Las notificaciones están bloqueadas para Lean. Habilitalas en los ajustes del dispositivo y volvé a esta pantalla.',
  unavailable: 'Las notificaciones no están disponibles por ahora.',
};

function DeviceSection() {
  const device = usePushDevice();
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  async function test() {
    setTesting(true);
    try {
      await sendTestPush();
      toast('Notificación de prueba enviada');
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'No se pudo enviar la prueba.');
    } finally {
      setTesting(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      {device.state === 'loading' ? (
        <Skeleton className="h-11" />
      ) : device.state === 'on' ? (
        <>
          <p className="text-sm">Activadas en este dispositivo.</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="min-w-0 flex-1"
              disabled={testing || device.busy}
              onClick={() => void test()}
            >
              {testing ? 'Enviando…' : 'Probar'}
            </Button>
            <Button
              variant="ghost"
              className="min-w-0 flex-1"
              disabled={device.busy}
              onClick={() => void device.disable()}
            >
              Desactivar
            </Button>
          </div>
        </>
      ) : device.state === 'off' ? (
        <>
          <p className="text-sm text-muted">
            Recibí avisos para cargar tus comidas en este dispositivo.
          </p>
          <Button className="w-full" disabled={device.busy} onClick={() => void device.enable()}>
            {device.busy ? 'Activando…' : 'Activar notificaciones'}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted">{DEVICE_TEXT[device.state]}</p>
      )}
      {device.error && (
        <p role="alert" className="text-sm text-danger">
          {device.error}
        </p>
      )}
    </div>
  );
}

function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center"
    >
      <span
        aria-hidden
        className={`relative h-6 w-11 rounded-full transition motion-reduce:transition-none ${checked ? 'bg-accent' : 'bg-border'}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition motion-reduce:transition-none ${checked ? 'left-5.5' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

function ReminderRow({
  draft,
  defaultMessage,
  onChange,
}: {
  draft: Draft;
  defaultMessage: string;
  onChange: (draft: Draft) => void;
}) {
  const id = useId();
  const label = REMINDER_LABELS[draft.slot];
  return (
    <li className="space-y-2 border-t border-border py-3 first:border-t-0">
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.enabled}
          label={`Recordatorio de ${label}`}
          onChange={(enabled) => onChange({ ...draft, enabled })}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{label}</p>
          {HINTS[draft.slot] && <p className="text-xs text-muted">{HINTS[draft.slot]}</p>}
        </div>
        <input
          type="time"
          aria-label={`Hora de ${label}`}
          value={draft.time}
          disabled={!draft.enabled}
          onChange={(event) => onChange({ ...draft, time: event.target.value })}
          className="min-h-11 rounded-xl border border-border bg-bg px-3 disabled:opacity-50"
        />
      </div>
      {draft.enabled && (
        <div className="space-y-1">
          <label htmlFor={id} className="sr-only">
            Mensaje de {label}
          </label>
          <input
            id={id}
            type="text"
            maxLength={REMINDER_MESSAGE_MAX}
            placeholder={defaultMessage}
            value={draft.message}
            onChange={(event) => onChange({ ...draft, message: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm placeholder:text-muted"
          />
        </div>
      )}
    </li>
  );
}

export function RemindersCard() {
  const query = useReminders();
  const save = useSaveReminders();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (query.data && !drafts) setDrafts(toDraft(query.data.reminders));
  }, [query.data, drafts]);
  const saved = query.data ? toDraft(query.data.reminders) : null;
  const dirty = !!drafts && JSON.stringify(drafts) !== JSON.stringify(saved);

  function submit() {
    if (!drafts) return;
    const parsed = updateRemindersSchema.safeParse({
      reminders: drafts.map((draft) => ({ ...draft, message: draft.message || null })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisá los recordatorios.');
      return;
    }
    setError(undefined);
    save.mutate(parsed.data, {
      onSuccess: (data) => {
        setDrafts(toDraft(data.reminders));
        toast('Recordatorios guardados');
      },
      onError: (failure) => setError(failure.message),
    });
  }

  return (
    <Card className="min-w-0 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Recordatorios</h2>
        <p className="text-sm text-muted">
          Te avisamos a estas horas si todavía no cargaste esa comida.
        </p>
      </div>
      <DeviceSection />
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState
          message="No se pudieron cargar los recordatorios."
          onRetry={() => void query.refetch()}
        />
      ) : (
        drafts && (
          <>
            <ul>
              {drafts.map((draft, index) => (
                <ReminderRow
                  key={draft.slot}
                  draft={draft}
                  defaultMessage={
                    query.data.reminders.find((item) => item.slot === draft.slot)?.defaultMessage ??
                    ''
                  }
                  onChange={(next) =>
                    setDrafts((items) =>
                      items ? items.map((item, i) => (i === index ? next : item)) : items,
                    )
                  }
                />
              ))}
            </ul>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={!dirty || save.isPending} onClick={submit}>
              {save.isPending ? 'Guardando…' : 'Guardar recordatorios'}
            </Button>
          </>
        )
      )}
    </Card>
  );
}
