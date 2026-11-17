import {
  CARBS_KCAL_PER_G,
  FAT_KCAL_PER_G,
  FAT_PER_KG,
  PROTEIN_KCAL_PER_G,
  WATER_ML_PER_KG,
  WATER_ROUNDING_STEP_ML,
} from './constants';

export function splitMacros(
  kcal: number,
  weightKg: number,
  proteinPerKg: number,
): { proteinG: number; carbsG: number; fatG: number } {
  let proteinG = proteinPerKg * weightKg;
  let fatG = FAT_PER_KG * weightKg;
  const baseKcal = PROTEIN_KCAL_PER_G * proteinG + FAT_KCAL_PER_G * fatG;
  let carbsG = (kcal - baseKcal) / CARBS_KCAL_PER_G;
  if (carbsG < 0) {
    carbsG = 0;
    const scale = kcal / baseKcal;
    proteinG *= scale;
    fatG *= scale;
  }
  return { proteinG: Math.round(proteinG), carbsG: Math.round(carbsG), fatG: Math.round(fatG) };
}

export function calcWaterMl(weightKg: number): number {
  return Math.round((WATER_ML_PER_KG * weightKg) / WATER_ROUNDING_STEP_ML) * WATER_ROUNDING_STEP_ML;
}

/**
 * Re-targets a daily plan to new calories keeping protein and fat, which carry the
 * per-kg logic, and moving the difference into carbs. If protein and fat alone exceed
 * the new calories, carbs drop to 0 and protein and fat scale down proportionally.
 */
export function rebalanceMacrosForKcal(
  kcal: number,
  current: { proteinG: number; fatG: number },
): { proteinG: number; carbsG: number; fatG: number } {
  let proteinG = Math.max(current.proteinG, 0);
  let fatG = Math.max(current.fatG, 0);
  const baseKcal = PROTEIN_KCAL_PER_G * proteinG + FAT_KCAL_PER_G * fatG;
  let carbsG = (kcal - baseKcal) / CARBS_KCAL_PER_G;
  if (carbsG < 0) {
    carbsG = 0;
    const scale = baseKcal > 0 ? kcal / baseKcal : 0;
    proteinG *= scale;
    fatG *= scale;
  }
  const round = (value: number) => Math.round(value * 10) / 10 || 0;
  return { proteinG: round(proteinG), carbsG: round(carbsG), fatG: round(fatG) };
}
