import { useState } from 'react';
import { createExerciseSchema, updateExerciseSchema, type ExerciseLog } from '@lean/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Sheet } from '../../components/ui/Sheet';
import { useExerciseMutation } from './activityApi';

export function ExerciseSheet({
  date,
  entry,
  onClose,
}: {
  date: string;
  entry?: ExerciseLog;
  onClose: () => void;
}) {
  const [activity, setActivity] = useState(entry?.activity ?? '');
  const [minutes, setMinutes] = useState(entry ? String(entry.minutes) : '');
  const [kcal, setKcal] = useState(entry ? String(entry.kcal) : '');
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mutation = useExerciseMutation(date);
  const fields = {
    activity,
    minutes: minutes.trim() ? Number(minutes) : NaN,
    kcal: kcal.trim() ? Number(kcal) : 0,
  };
  const result = entry
    ? updateExerciseSchema.safeParse(fields)
    : createExerciseSchema.safeParse({ date, ...fields });
  const errorFor = (field: string) =>
    submitted && !result.success
      ? result.error.issues.find((issue) => issue.path[0] === field)?.message
      : undefined;
  return (
    <Sheet
      open
      title={entry ? 'Editar ejercicio' : 'Agregar ejercicio'}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!result.success || mutation.isPending) return;
          mutation.mutate(
            entry ? { kind: 'edit', id: entry.id, fields } : { kind: 'add', fields },
            { onSuccess: onClose },
          );
        }}
      >
        <Input
          label="Actividad"
          value={activity}
          onChange={(event) => setActivity(event.target.value)}
          error={errorFor('activity')}
          disabled={mutation.isPending}
        />
        <Input
          label="Minutos"
          inputMode="numeric"
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
          error={errorFor('minutes')}
          disabled={mutation.isPending}
        />
        <Input
          label="Calorías (opcional)"
          inputMode="numeric"
          value={kcal}
          onChange={(event) => setKcal(event.target.value)}
          error={errorFor('kcal')}
          disabled={mutation.isPending}
        />
        <div className="flex flex-wrap justify-between gap-2">
          {entry && (
            <Button
              variant="danger"
              disabled={mutation.isPending}
              onClick={() => setConfirming(true)}
            >
              Eliminar
            </Button>
          )}
          <Button type="submit" disabled={mutation.isPending}>
            Guardar
          </Button>
        </div>
        {entry && confirming && (
          <div className="space-y-3 rounded-xl border border-border p-3">
            <p>¿Querés eliminar este ejercicio?</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() => setConfirming(false)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={mutation.isPending}
                onClick={() =>
                  mutation.mutate({ kind: 'delete', id: entry.id }, { onSuccess: onClose })
                }
              >
                Confirmar eliminación
              </Button>
            </div>
          </div>
        )}
      </form>
    </Sheet>
  );
}
