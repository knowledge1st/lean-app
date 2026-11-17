import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { ProfileResponse } from '@lean/shared';
import { ErrorState } from '../components/ui/ErrorState';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { formatDecimalInput } from '../features/goals/format';
import { todayLocal } from '../lib/date';
import {
  getProfile,
  getActiveGoal,
  profileKey,
  activeGoalKey,
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
// Keep writes ordered even when a preview is abandoned or the wizard remounts.
let operations: Promise<unknown> = Promise.resolve();
function inOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation);
  operations = result.catch(() => undefined);
  return result;
}
const titles = ['Sobre vos', 'Qué querés lograr', 'Detalle', 'Tu plan'];
export function ObjetivoNuevo() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [restored] = useState(readDraft);
  const [draft, setDraft] = useState<Draft>(restored ?? { ...emptyDraft });
  const [ready, setReady] = useState(!!restored);
  const [errors, setErrors] = useState<Errors>({});
  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const content = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const today = todayLocal();
  const initial = useQuery({
    queryKey: ['goals', 'wizard', 'initial'],
    queryFn: async () => {
      const [profile, goal] = await Promise.all([getProfile(), getActiveGoal()]);
      client.setQueryData(profileKey, profile);
      client.setQueryData(activeGoalKey, goal);
      return { profile, goal };
    },
    enabled: !ready,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  useEffect(() => {
    if (ready || initial.isFetching || initial.isError || !initial.data) return;
    const { profile, goal } = initial.data;
    setDraft({
      ...emptyDraft,
      ...(profile
        ? {
            sex: profile.sex,
            birthDate: profile.birthDate,
            heightCm: formatDecimalInput(profile.heightCm),
            activityLevel: profile.activityLevel,
          }
        : {}),
      ...(goal ? { weightKg: formatDecimalInput(goal.progress.currentWeightKg) } : {}),
    });
    setReady(true);
  }, [initial.data, initial.isFetching, initial.isError, ready]);
  useEffect(() => {
    if (ready) storeDraft(draft);
  }, [draft, ready]);
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [draft.step, ready]);
  const activeGoal = useQuery({
    queryKey: activeGoalKey,
    queryFn: getActiveGoal,
    enabled: ready,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  useEffect(() => {
    if (Object.keys(errors).length)
      content.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  const preview = useQuery({
    queryKey: ['goals', 'wizard', 'preview', draft, today],
    enabled: ready && draft.step === 4,
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      inOrder(async () => {
        signal.throwIfAborted();
        const input = profileInput(draft);
        const saved = await client.fetchQuery({
          queryKey: profileKey,
          queryFn: getProfile,
          staleTime: 0,
        });
        signal.throwIfAborted();
        if (
          !saved ||
          (Object.keys(input) as (keyof ProfileResponse)[]).some((key) => saved[key] !== input[key])
        ) {
          client.setQueryData(profileKey, await saveProfile(input));
        }
        // A PUT already sent must finish before the next profile write starts.
        signal.throwIfAborted();
        return previewGoal(goalBody(draft));
      }),
  });
  const create = useCreateGoal();
  const change = (key: keyof Draft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  };
  const go = (step: number) => {
    if (submitting.current) return;
    setErrors({});
    setConfirmReplacement(false);
    setSubmitError(false);
    create.reset();
    setDraft((current) => ({ ...current, step }));
  };
  const submit = async () => {
    if (submitting.current) return;
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
      if (activeGoal.isPending || activeGoal.isError) return;
      if (activeGoal.data && !confirmReplacement) {
        setConfirmReplacement(true);
        return;
      }
      submitting.current = true;
      setSaving(true);
      setSubmitError(false);
      try {
        await inOrder(async () => {
          // Reassert this draft on the server before creation, after all older writes.
          client.setQueryData(profileKey, await saveProfile(profileInput(draft)));
          await create.mutateAsync(goalBody(draft));
        });
        clearDraft();
        navigate('/hoy', { replace: true });
      } catch {
        setSubmitError(true);
      } finally {
        submitting.current = false;
        setSaving(false);
      }
    }
  };
  const props = { draft, errors, change };
  return (
    <main
      ref={content}
      className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom))]"
    >
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
          <Button
            variant="ghost"
            disabled={saving || create.isPending}
            onClick={() => go(draft.step - 1)}
          >
            Atrás
          </Button>
        )}
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">
          {titles[draft.step - 1]}
        </h1>
      </header>
      {!ready ? (
        initial.isError ? (
          <ErrorState
            message="No se pudo cargar tus datos."
            onRetry={() => void initial.refetch()}
          />
        ) : (
          <div role="status" aria-label="Cargando tus datos" className="space-y-5">
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
            <Skeleton className="h-24" />
          </div>
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
            (!preview.data && preview.isPending ? (
              <div role="status" aria-label="Armando tu plan" className="space-y-5">
                <Skeleton className="h-48" />
                <Skeleton className="h-32" />
              </div>
            ) : preview.isError ? (
              <ErrorState
                message="No pudimos armar tu plan. Revisá tu conexión y probá de nuevo."
                onRetry={() => void preview.refetch()}
              />
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
          {draft.step === 4 && (
            <div className="mt-5 space-y-3">
              {preview.data && !preview.isPlaceholderData && (
                <p className="text-sm text-muted">Tus datos personales ya quedaron guardados.</p>
              )}
              {activeGoal.isError && (
                <ErrorState
                  message="No pudimos verificar tu objetivo actual."
                  onRetry={() => void activeGoal.refetch()}
                />
              )}
              {activeGoal.data && (
                <p>Vas a reemplazar tu objetivo actual. El anterior queda en el historial.</p>
              )}
              {confirmReplacement && (
                <p role="status">Tocá «Confirmar reemplazo» para guardar tu nuevo objetivo.</p>
              )}
            </div>
          )}
          {(submitError || create.isError) && (
            <p role="alert" className="mt-4 text-danger">
              No pudimos guardar tu objetivo. Revisá tu conexión y volvé a intentar.
            </p>
          )}
        </>
      )}
      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          className="mx-auto flex w-full max-w-lg"
          disabled={
            !ready ||
            saving ||
            create.isPending ||
            (draft.step === 4 &&
              (activeGoal.isPending ||
                activeGoal.isError ||
                !preview.data ||
                preview.isFetching ||
                preview.isError ||
                preview.data.warnings.some(({ code }) => code === 'date_unreachable')))
          }
          onClick={() => void submit()}
        >
          {saving || create.isPending
            ? 'Guardando…'
            : draft.step === 4
              ? activeGoal.data
                ? confirmReplacement
                  ? 'Confirmar reemplazo'
                  : 'Reemplazar objetivo'
                : 'Empezar'
              : 'Siguiente'}
        </Button>
      </footer>
    </main>
  );
}
