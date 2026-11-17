import {
  createGoalSchema,
  profileInputSchema,
  maxGoalTargetDate,
  type CreateGoalInput,
  type ProfileInput,
  type GoalInput,
} from '@lean/shared';
import { todayLocal } from '../../lib/date';
export const DRAFT_KEY = 'lean.goalWizard.v1';
export const emptyDraft = {
  step: 1,
  sex: '',
  birthDate: '',
  heightCm: '',
  weightKg: '',
  bodyFatPct: '',
  activityLevel: '',
  mode: '',
  preset: '',
  targetWeightKg: '',
  targetDate: '',
  kcal: '',
  proteinG: '',
  carbsG: '',
  fatG: '',
};
export type Draft = typeof emptyDraft;
export type Errors = Partial<Record<keyof Draft, string>>;
const requiredMessages: Errors = {
  sex: 'Elegí una opción',
  activityLevel: 'Elegí una opción',
  mode: 'Elegí una opción',
  preset: 'Elegí una opción',
  birthDate: 'Indicá tu fecha de nacimiento',
  heightCm: 'Indicá tu altura',
  weightKg: 'Indicá tu peso',
  targetWeightKg: 'Indicá tu peso objetivo',
  targetDate: 'Elegí una fecha',
  kcal: 'Indicá las calorías',
  proteinG: 'Indicá la proteína',
  carbsG: 'Indicá los carbohidratos',
  fatG: 'Indicá la grasa',
};
export function fieldError(draft: Draft, name: keyof Draft, message: string): string {
  return typeof draft[name] === 'string' && !draft[name].trim()
    ? (requiredMessages[name] ?? message)
    : message;
}
export const numeric = (value: string) =>
  value.trim() === '' ? NaN : Number(value.replace(',', '.'));
export function profileInput(draft: Draft): ProfileInput {
  return profileInputSchema.parse({
    sex: draft.sex,
    birthDate: draft.birthDate,
    heightCm: numeric(draft.heightCm),
    activityLevel: draft.activityLevel,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}
export function goalBody(draft: Draft): CreateGoalInput {
  const goal =
    draft.mode === 'weight_date'
      ? {
          mode: draft.mode,
          targetWeightKg: numeric(draft.targetWeightKg),
          targetDate: draft.targetDate,
        }
      : draft.mode === 'composition'
        ? { mode: draft.mode, preset: draft.preset }
        : {
            mode: draft.mode,
            kcal: numeric(draft.kcal),
            proteinG: numeric(draft.proteinG),
            carbsG: numeric(draft.carbsG),
            fatG: numeric(draft.fatG),
          };
  return createGoalSchema.parse({
    goal,
    weightKg: numeric(draft.weightKg),
    ...(draft.bodyFatPct.trim() ? { bodyFatPct: numeric(draft.bodyFatPct) } : {}),
  });
}
export function validateStep(draft: Draft, step: number, today = todayLocal()): Errors {
  const errors: Errors = {};
  if (step === 1) {
    const result = profileInputSchema.safeParse({
      sex: draft.sex,
      birthDate: draft.birthDate,
      heightCm: numeric(draft.heightCm),
      activityLevel: draft.activityLevel,
    });
    if (!result.success)
      for (const issue of result.error.issues) errors[issue.path[0] as keyof Draft] = issue.message;
    if (draft.birthDate >= today)
      errors.birthDate = 'Indicá una fecha de nacimiento anterior a hoy';
    const body = createGoalSchema.omit({ goal: true }).safeParse({
      weightKg: numeric(draft.weightKg),
      ...(draft.bodyFatPct.trim() ? { bodyFatPct: numeric(draft.bodyFatPct) } : {}),
    });
    if (!body.success)
      for (const issue of body.error.issues) errors[issue.path[0] as keyof Draft] = issue.message;
  } else if (step === 2) {
    if (
      !(['weight_date', 'composition', 'manual'] satisfies GoalInput['mode'][]).includes(
        draft.mode as GoalInput['mode'],
      )
    )
      errors.mode = 'Elegí qué querés lograr';
  } else if (step === 3) {
    try {
      goalBody(draft);
    } catch (error) {
      if (error && typeof error === 'object' && 'issues' in error) {
        for (const issue of (error as { issues: { path: PropertyKey[]; message: string }[] })
          .issues)
          errors[issue.path.at(-1) as keyof Draft] = issue.message;
      }
    }
    if (
      draft.mode === 'weight_date' &&
      (draft.targetDate <= today || draft.targetDate > maxGoalTargetDate(today))
    )
      errors.targetDate = 'Elegí una fecha desde mañana hasta dentro de 5 años';
  }
  for (const name of Object.keys(errors) as (keyof Draft)[])
    errors[name] = fieldError(draft, name, errors[name]!);
  return errors;
}
export function reachableStep(draft: Draft): number {
  for (let step = 1; step < draft.step; step++)
    if (Object.keys(validateStep(draft, step)).length) return step;
  return draft.step;
}
export function readDraft(): Draft | null {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Draft;
    if (
      !Number.isInteger(data.step) ||
      data.step < 1 ||
      data.step > 4 ||
      Object.keys(emptyDraft).some(
        (key) => key !== 'step' && typeof data[key as keyof Draft] !== 'string',
      )
    )
      return null;
    for (const [key, options] of Object.entries({
      sex: ['', 'female', 'male'],
      activityLevel: ['', 'sedentary', 'light', 'moderate', 'active'],
      mode: ['', 'weight_date', 'composition', 'manual'],
      preset: ['', 'cut', 'recomp', 'lean_bulk'],
    }))
      if (!options.includes(String(data[key as keyof Draft]))) return null;
    return { ...data, step: reachableStep(data) };
  } catch {
    return null;
  }
}
export function storeDraft(draft: Draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Storage may be unavailable. */
  }
}
export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function clearWizardSkipped() {
  try {
    localStorage.removeItem('lean.goalWizard.skipped');
  } catch {
    /* Storage may be unavailable. */
  }
}
export function wasWizardSkipped() {
  try {
    return localStorage.getItem('lean.goalWizard.skipped') === '1';
  } catch {
    return false;
  }
}
export function markWizardSkipped() {
  try {
    localStorage.setItem('lean.goalWizard.skipped', '1');
  } catch {
    /* Storage may be unavailable. */
  }
}
