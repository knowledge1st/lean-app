// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  clearDraft,
  emptyDraft,
  markWizardSkipped,
  readDraft,
  storeDraft,
  validateStep,
  wasWizardSkipped,
} from './draft';
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});
it('tolera almacenamiento bloqueado', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(readDraft()).toBeNull();
  expect(wasWizardSkipped()).toBe(false);
  expect(() => {
    storeDraft(emptyDraft);
    clearDraft();
    markWizardSkipped();
  }).not.toThrow();
});
it('valida rangos, decimales y el máximo de cinco años', () => {
  const about = {
    ...emptyDraft,
    sex: 'female',
    birthDate: '1990-01-01',
    heightCm: '165,5',
    weightKg: '70,5',
    bodyFatPct: '20,5',
    activityLevel: 'moderate',
  };
  expect(validateStep(about, 1, '2026-11-16')).toEqual({});
  expect(
    validateStep(
      { ...about, heightCm: '165.55', weightKg: '401', bodyFatPct: '1' },
      1,
      '2026-11-16',
    ),
  ).toMatchObject({
    heightCm: expect.any(String),
    weightKg: expect.any(String),
    bodyFatPct: expect.any(String),
  });
  const detail = { ...about, mode: 'weight_date', targetWeightKg: '65', targetDate: '2031-11-16' };
  expect(validateStep(detail, 3, '2026-11-16')).toEqual({});
  for (const targetDate of ['2031-11-17', '2026-11-16', '2026-11-15'])
    expect(validateStep({ ...detail, targetDate }, 3, '2026-11-16').targetDate).toBeTruthy();
});

it('pide los datos vacíos con mensajes específicos en cada paso', () => {
  expect(validateStep(emptyDraft, 1, '2026-11-16')).toEqual({
    sex: 'Elegí una opción',
    birthDate: 'Indicá tu fecha de nacimiento',
    heightCm: 'Indicá tu altura',
    weightKg: 'Indicá tu peso',
    activityLevel: 'Elegí una opción',
  });
  expect(validateStep(emptyDraft, 2)).toEqual({ mode: 'Elegí una opción' });
  const about = { ...emptyDraft, weightKg: '70' };
  expect(validateStep({ ...about, mode: 'weight_date' }, 3)).toEqual({
    targetWeightKg: 'Indicá tu peso objetivo',
    targetDate: 'Elegí una fecha',
  });
  expect(validateStep({ ...about, mode: 'composition' }, 3)).toEqual({
    preset: 'Elegí una opción',
  });
  expect(validateStep({ ...about, mode: 'manual' }, 3)).toEqual({
    kcal: 'Indicá las calorías',
    proteinG: 'Indicá la proteína',
    carbsG: 'Indicá los carbohidratos',
    fatG: 'Indicá la grasa',
  });
});

it('conserva los mensajes de rango para valores cargados', () => {
  expect(validateStep({ ...emptyDraft, heightCm: '99', weightKg: '401' }, 1)).toMatchObject({
    heightCm: 'La altura debe estar entre 100 y 250 cm',
    weightKg: 'El peso debe estar entre 20 y 400 kg',
  });
});
