import type { ActivityLevel, CompositionPreset, Sex } from './types';

export const KCAL_PER_KG = 7700;
export const DAYS_PER_WEEK = 7;
export const MS_PER_DAY = 86_400_000;
export const KCAL_ROUNDING_STEP = 10;
export const WEIGHT_DECIMAL_FACTOR = 10;
export const PERCENT_SCALE = 100;
export const TARGET_WEIGHT_TOLERANCE_KG = 0.05;
export const WEIGHT_DELTA_DECIMAL_FACTOR = 1_000_000;
export const PLAN_PRECISION_EPSILON = 1e-9;
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
} as const satisfies Record<ActivityLevel, number>;
export const KCAL_FLOORS = { female: 1200, male: 1500 } as const satisfies Record<Sex, number>;
export const MAX_LOSS_PCT_PER_WEEK = 0.01;
export const MAX_GAIN_PCT_PER_WEEK = 0.005;
export const PRESET_KCAL_PCT = {
  cut: -0.2,
  recomp: -0.05,
  lean_bulk: 0.1,
} as const satisfies Record<CompositionPreset, number>;
export const DEFAULT_PROTEIN_PER_KG = 2;
export const PRESET_PROTEIN_PER_KG = {
  cut: 2.2,
  recomp: DEFAULT_PROTEIN_PER_KG,
  lean_bulk: 1.8,
} as const satisfies Record<CompositionPreset, number>;
export const FAT_PER_KG = 0.8;
export const PROTEIN_KCAL_PER_G = 4;
export const CARBS_KCAL_PER_G = 4;
export const FAT_KCAL_PER_G = 9;
export const WATER_ML_PER_KG = 35;
export const WATER_ROUNDING_STEP_ML = 250;
export const MANUAL_MACROS_TOLERANCE = 0.1;
export const MIFFLIN_WEIGHT_FACTOR = 10;
export const MIFFLIN_HEIGHT_FACTOR = 6.25;
export const MIFFLIN_AGE_FACTOR = 5;
export const MIFFLIN_SEX_OFFSET = { male: 5, female: -161 } as const satisfies Record<Sex, number>;
export const KATCH_BASE_KCAL = 370;
export const KATCH_LEAN_MASS_FACTOR = 21.6;
