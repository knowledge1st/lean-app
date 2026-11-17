import { useState, type FormEvent } from 'react';
import { profileInputSchema, type ProfileResponse } from '@lean/shared';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Sheet } from '../../components/ui/Sheet';
import { ApiError } from '../../lib/api';
import { useProfile, useSaveProfile } from './api';
import { emptyDraft, fieldError, numeric, type Draft, type Errors } from './draft';
import { Choices, Field } from './fields';
import { todayLocal } from '../../lib/date';
import { formatDecimalInput, formatNumber } from './format';

const activityOptions = [
  ['sedentary', 'Poco movimiento'],
  ['light', 'Algo activo'],
  ['moderate', 'Activo'],
  ['active', 'Muy activo'],
] as const;

export function ProfileCard() {
  const query = useProfile();
  const [open, setOpen] = useState(false);
  const profile = query.data;
  return (
    <Card className="min-w-0 space-y-5">
      <h2 className="text-xl font-semibold">Datos personales</h2>
      {query.isPending ? (
        <div role="status" aria-label="Cargando tus datos" className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          message="No se pudo cargar tus datos personales."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {profile ? (
            <dl className="grid grid-cols-2 gap-3">
              {[
                ['Sexo', profile.sex === 'female' ? 'Mujer' : 'Hombre'],
                [
                  'Nacimiento',
                  new Intl.DateTimeFormat('es-AR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(`${profile.birthDate}T00:00:00Z`)),
                ],
                ['Altura', `${formatNumber(profile.heightCm)} cm`],
                [
                  'Nivel de actividad',
                  activityOptions.find(([value]) => value === profile.activityLevel)?.[1],
                ],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Completá tus datos personales para armar tu plan.</p>
          )}
          <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
            {profile ? 'Editar' : 'Completar mis datos'}
          </Button>
          {open && <ProfileForm profile={profile ?? null} onClose={() => setOpen(false)} />}
        </>
      )}
    </Card>
  );
}

export function ProfileForm({
  profile,
  onClose,
}: {
  profile: ProfileResponse | null;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<Draft>({
    ...emptyDraft,
    ...(profile
      ? {
          sex: profile.sex,
          birthDate: profile.birthDate,
          heightCm: formatDecimalInput(profile.heightCm),
          activityLevel: profile.activityLevel,
        }
      : {}),
  });
  const [errors, setErrors] = useState<Errors>({});
  const save = useSaveProfile();
  const props = {
    draft,
    errors,
    change: (key: keyof Draft, value: string) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setErrors({});
      save.reset();
    },
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.isPending) return;
    const result = profileInputSchema.safeParse({
      sex: draft.sex,
      birthDate: draft.birthDate,
      heightCm: numeric(draft.heightCm),
      activityLevel: draft.activityLevel,
      timeZone: profile?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const nextErrors: Errors = {};
    if (!result.success) {
      for (const issue of result.error.issues)
        nextErrors[issue.path[0] as keyof Draft] = fieldError(
          draft,
          issue.path[0] as keyof Draft,
          issue.message,
        );
    }
    if (draft.birthDate >= todayLocal())
      nextErrors.birthDate = 'Indicá una fecha de nacimiento anterior a hoy';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    try {
      if (!result.success) return;
      await save.mutateAsync(result.data);
      onClose();
    } catch {
      /* The mutation error is shown in the form. */
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      title="Editar datos personales"
    >
      <form onSubmit={(event) => void submit(event)} noValidate className="space-y-5">
        <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
          <Choices
            {...props}
            name="sex"
            legend="Sexo"
            options={[
              ['female', 'Mujer'],
              ['male', 'Hombre'],
            ]}
          />
          <Field {...props} name="birthDate" label="Fecha de nacimiento" type="date" />
          <Field {...props} name="heightCm" label="Altura" unit="cm" />
          <Choices
            {...props}
            name="activityLevel"
            legend="Nivel de actividad"
            options={activityOptions}
          />
        </fieldset>
        {save.isError && (
          <p role="alert" className="text-danger">
            {save.error instanceof ApiError
              ? save.error.status === 0
                ? 'Sin conexión. Revisá tu internet y volvé a intentar.'
                : 'No pudimos guardar tus datos. Revisalos y probá de nuevo.'
              : 'No pudimos guardar tus datos. Probá de nuevo.'}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </form>
    </Sheet>
  );
}
