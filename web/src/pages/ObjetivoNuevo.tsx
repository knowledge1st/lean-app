import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { ProfileResponse } from '@lean/shared';
import { Button } from '../components/ui/Button';
import { todayLocal } from '../lib/date';
import {
  getProfile,
  getActiveGoal,
  profileKey,
  saveProfile,
  previewGoal,
  useCreateGoal,
} from '../features/goals/api';
import {
  clearDraft,
  emptyDraft,
  goalBody,
  markWizardSkipped,
  profileInput,
  readDraft,
  storeDraft,
  validateStep,
  type Draft,
  type Errors,
} from '../features/goals/draft';
import { StepAbout } from '../features/goals/StepAbout';
import { StepKind } from '../features/goals/StepKind';
import { StepDetail } from '../features/goals/StepDetail';
import { StepPlan } from '../features/goals/StepPlan';
const titles = ['Sobre vos', 'Qué querés lograr', 'Detalle', 'Tu plan'];
export function ObjetivoNuevo() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [restored] = useState(readDraft);
  const [draft, setDraft] = useState<Draft>(restored ?? { ...emptyDraft });
  const [ready, setReady] = useState(!!restored);
  const [errors, setErrors] = useState<Errors>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const today = todayLocal();
  const initial = useQuery({
    queryKey: ['goals', 'wizard', 'initial'],
    queryFn: async () => {
      const [profile, goal] = await Promise.all([getProfile(), getActiveGoal()]);
      client.setQueryData(profileKey, profile);
      return { profile, goal };
    },
    enabled: !ready,
    retry: false,
  });
  useEffect(() => {
    if (ready || !initial.data) return;
    const { profile, goal } = initial.data;
    setDraft({
      ...emptyDraft,
      ...(profile
        ? {
            sex: profile.sex,
            birthDate: profile.birthDate,
            heightCm: String(profile.heightCm),
            activityLevel: profile.activityLevel,
          }
        : {}),
      ...(goal ? { weightKg: String(goal.progress.currentWeightKg) } : {}),
    });
    setReady(true);
  }, [initial.data, ready]);
  useEffect(() => {
    if (ready) storeDraft(draft);
  }, [draft, ready]);
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [draft.step, ready]);
  const preview = useQuery({
    queryKey: ['goals', 'wizard', 'preview', draft, today],
    enabled: ready && draft.step === 4,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const input = profileInput(draft);
      const saved = await client.fetchQuery({ queryKey: profileKey, queryFn: getProfile });
      if (
        !saved ||
        (Object.keys(input) as (keyof ProfileResponse)[]).some((key) => saved[key] !== input[key])
      ) {
        client.setQueryData(profileKey, await saveProfile(input));
      }
      return previewGoal(goalBody(draft));
    },
  });
  const create = useCreateGoal();
  const change = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  };
  const go = (step: number) => {
    setErrors({});
    create.reset();
    setDraft((current) => ({ ...current, step }));
  };
  const submit = async () => {
    if (draft.step < 4) {
      const nextErrors = validateStep(draft, draft.step, today);
      setErrors(nextErrors);
      if (!Object.keys(nextErrors).length) go(draft.step + 1);
    } else if (
      preview.data &&
      !preview.isFetching &&
      !preview.isError &&
      !preview.data.warnings.some(({ code }) => code === 'date_unreachable')
    ) {
      try {
        await create.mutateAsync(goalBody(draft));
        clearDraft();
        navigate('/hoy', { replace: true });
      } catch {
        /* The error is displayed below. */
      }
    }
  };
  const props = { draft, errors, change };
  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <header className="mb-6 space-y-3">
        <p className="text-sm text-muted">Paso {draft.step} de 4</p>
        <div
          role="progressbar"
          aria-label="Progreso del objetivo"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={draft.step}
          className="h-2 overflow-hidden rounded-full bg-border"
        >
          <div className="h-full bg-accent" style={{ width: `${draft.step * 25}%` }} />
        </div>
        {draft.step > 1 && (
          <Button variant="ghost" disabled={create.isPending} onClick={() => go(draft.step - 1)}>
            Atrás
          </Button>
        )}
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">
          {titles[draft.step - 1]}
        </h1>
      </header>
      {!ready ? (
        initial.isError ? (
          <div role="alert">
            <p>No pudimos cargar tus datos.</p>
            <Button onClick={() => void initial.refetch()}>Reintentar</Button>
          </div>
        ) : (
          <p role="status">Cargando tus datos…</p>
        )
      ) : (
        <>
          {draft.step === 1 && (
            <>
              <StepAbout {...props} />
              <Button
                className="mt-4"
                variant="ghost"
                onClick={() => {
                  markWizardSkipped();
                  navigate('/hoy');
                }}
              >
                Omitir por ahora
              </Button>
            </>
          )}
          {draft.step === 2 && <StepKind {...props} />}
          {draft.step === 3 && <StepDetail {...props} today={today} />}
          {draft.step === 4 &&
            (preview.isFetching ? (
              <p role="status">Armando tu plan…</p>
            ) : preview.isError ? (
              <div role="alert">
                <p>No pudimos armar tu plan. Revisá tu conexión y probá de nuevo.</p>
                <Button onClick={() => void preview.refetch()}>Reintentar</Button>
              </div>
            ) : (
              preview.data && (
                <StepPlan
                  plan={preview.data}
                  sex={profileInput(draft).sex}
                  today={today}
                  requestedDate={draft.mode === 'weight_date' ? draft.targetDate : undefined}
                  onEdit={go}
                />
              )
            ))}
          {create.isError && (
            <p role="alert" className="mt-4 text-danger">
              No pudimos guardar tu objetivo. Probá de nuevo con Empezar.
            </p>
          )}
        </>
      )}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          className="mx-auto flex w-full max-w-lg"
          disabled={
            !ready ||
            create.isPending ||
            (draft.step === 4 &&
              (!preview.data ||
                preview.isFetching ||
                preview.isError ||
                preview.data.warnings.some(({ code }) => code === 'date_unreachable')))
          }
          onClick={() => void submit()}
        >
          {create.isPending ? 'Guardando…' : draft.step === 4 ? 'Empezar' : 'Siguiente'}
        </Button>
      </footer>
    </main>
  );
}
