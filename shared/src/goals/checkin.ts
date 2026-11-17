import {
  CARBS_KCAL_PER_G,
  DAYS_PER_WEEK,
  FAT_KCAL_PER_G,
  KCAL_FLOORS,
  KCAL_PER_KG,
  KCAL_ROUNDING_STEP,
  MAX_GAIN_PCT_PER_WEEK,
  MAX_LOSS_PCT_PER_WEEK,
  PRESET_KCAL_PCT,
  PROTEIN_KCAL_PER_G,
} from './constants';
import { daysBetween } from './dates';
import type { CompositionPreset, Sex } from './types';

const MIN_LOGGED_DAYS = 10;
const MIN_WEIGH_INS = 4;
const WEEKLY_TOLERANCE_KG = 0.15;
const EPSILON = 1e-9;
const MAX_KCAL_ADJUSTMENT = 150;
const MIN_CARBS_G = 50;
const MIN_FAT_PER_KG = 0.6;

export type CheckinDay = {
  date: string;
  kcalEaten: number | null;
  weightKg: number | null;
  trendWeightKg: number | null;
};
export type CheckinMacros = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export type CheckinGoal =
  | { mode: 'weight_date'; expectedWeeklyChangeKg: number }
  | { mode: 'composition'; preset: CompositionPreset }
  | { mode: 'manual' };
export type CheckinInput = {
  days: CheckinDay[];
  currentTarget: CheckinMacros;
  goal: CheckinGoal;
  profile: { sex: Sex };
  weightKg: number;
};
export type CheckinResult =
  | { status: 'insufficient_data'; loggedDays: number; weighIns: number }
  | {
      status: 'on_track';
      loggedDays: number;
      weighIns: number;
      avgIntakeKcal: number;
      estimatedTdee: number;
      actualWeeklyChangeKg: number;
      expectedWeeklyChangeKg: number | null;
    }
  | {
      status: 'adjust';
      loggedDays: number;
      weighIns: number;
      avgIntakeKcal: number;
      estimatedTdee: number;
      actualWeeklyChangeKg: number;
      expectedWeeklyChangeKg: number;
      proposed: CheckinMacros;
      deltaKcal: number;
      reason: 'slower_than_plan' | 'faster_than_plan';
    };

const roundTo = (value: number, factor: number) => Math.round(value * factor) / factor;
const ceilKcal = (value: number) => Math.ceil(value / KCAL_ROUNDING_STEP) * KCAL_ROUNDING_STEP;
const floorKcal = (value: number) => Math.floor(value / KCAL_ROUNDING_STEP) * KCAL_ROUNDING_STEP;

function proposeMacros(input: CheckinInput, kcal: number): CheckinMacros {
  const current = input.currentTarget;
  let fatG = current.fatG;
  let carbsG = current.carbsG + (kcal - current.kcal) / CARBS_KCAL_PER_G;
  if (kcal < current.kcal && carbsG < MIN_CARBS_G) {
    // A pre-existing fat intake below the minimum is preserved, never raised.
    if (fatG >= MIN_FAT_PER_KG * input.weightKg) {
      fatG = Math.max(
        MIN_FAT_PER_KG * input.weightKg,
        current.fatG - ((MIN_CARBS_G - carbsG) * CARBS_KCAL_PER_G) / FAT_KCAL_PER_G,
      );
    }
    carbsG = MIN_CARBS_G;
  }
  return {
    kcal,
    proteinG: roundTo(current.proteinG, 10),
    carbsG: roundTo(carbsG, 10),
    fatG:
      fatG < current.fatG && roundTo(fatG, 10) < MIN_FAT_PER_KG * input.weightKg
        ? Math.ceil(MIN_FAT_PER_KG * input.weightKg * 10) / 10
        : roundTo(fatG, 10),
  };
}

export function evaluateCheckin(input: CheckinInput): CheckinResult {
  const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
  const logged = days.filter((day) => day.kcalEaten !== null);
  const loggedDays = logged.length;
  const weighIns = days.filter((day) => day.weightKg !== null).length;
  const trends = days.filter(
    (day): day is CheckinDay & { trendWeightKg: number } => day.trendWeightKg !== null,
  );
  const first = trends[0];
  const last = trends[trends.length - 1];
  if (
    loggedDays < MIN_LOGGED_DAYS ||
    weighIns < MIN_WEIGH_INS ||
    !days.slice(0, DAYS_PER_WEEK).some((day) => day.weightKg !== null) ||
    !days.slice(DAYS_PER_WEEK, DAYS_PER_WEEK * 2).some((day) => day.weightKg !== null) ||
    !first ||
    !last ||
    daysBetween(first.date, last.date) < DAYS_PER_WEEK
  ) {
    return { status: 'insufficient_data', loggedDays, weighIns };
  }

  const spanDays = daysBetween(first.date, last.date);
  const changeKg = last.trendWeightKg - first.trendWeightKg;
  const actual = (changeKg / spanDays) * DAYS_PER_WEEK;
  const average = logged.reduce((sum, day) => sum + day.kcalEaten!, 0) / loggedDays;
  const tdee = average - (changeKg * KCAL_PER_KG) / spanDays;
  const expected =
    input.goal.mode === 'manual'
      ? null
      : input.goal.mode === 'weight_date'
        ? input.goal.expectedWeeklyChangeKg
        : (PRESET_KCAL_PCT[input.goal.preset] * tdee * DAYS_PER_WEEK) / KCAL_PER_KG;
  const metrics = {
    loggedDays,
    weighIns,
    avgIntakeKcal: Math.round(average),
    estimatedTdee: Math.round(tdee),
    actualWeeklyChangeKg: roundTo(actual, 100),
    expectedWeeklyChangeKg: expected === null ? null : roundTo(expected, 100),
  };
  if (expected === null || Math.abs(actual - expected) <= WEEKLY_TOLERANCE_KG + EPSILON) {
    return { status: 'on_track', ...metrics };
  }

  const desired = tdee + (expected * KCAL_PER_KG) / DAYS_PER_WEEK;
  const delta =
    Math.round(
      Math.max(
        -MAX_KCAL_ADJUSTMENT,
        Math.min(MAX_KCAL_ADJUSTMENT, desired - input.currentTarget.kcal),
      ) / KCAL_ROUNDING_STEP,
    ) * KCAL_ROUNDING_STEP;
  let kcal = input.currentTarget.kcal + delta;
  const minimum = tdee - (MAX_LOSS_PCT_PER_WEEK * input.weightKg * KCAL_PER_KG) / DAYS_PER_WEEK;
  const maximum = tdee + (MAX_GAIN_PCT_PER_WEEK * input.weightKg * KCAL_PER_KG) / DAYS_PER_WEEK;
  if (kcal < minimum) kcal = ceilKcal(minimum);
  else if (kcal > maximum) kcal = floorKcal(maximum);
  kcal = Math.max(
    kcal,
    ceilKcal(
      PROTEIN_KCAL_PER_G * input.currentTarget.proteinG +
        FAT_KCAL_PER_G * MIN_FAT_PER_KG * input.weightKg +
        CARBS_KCAL_PER_G * MIN_CARBS_G,
    ),
    KCAL_FLOORS[input.profile.sex],
  );
  const deltaKcal = kcal - input.currentTarget.kcal;
  if (deltaKcal === 0) return { status: 'on_track', ...metrics };
  return {
    status: 'adjust',
    ...metrics,
    expectedWeeklyChangeKg: roundTo(expected, 100),
    proposed: proposeMacros(input, kcal),
    deltaKcal,
    reason:
      (expected <= 0 && actual > expected) || (expected > 0 && actual < expected)
        ? 'slower_than_plan'
        : 'faster_than_plan',
  };
}

export function expectedWeeklyChangeForWeightGoal(args: {
  startWeightKg: number;
  targetWeightKg: number;
  startDate: string;
  endDate: string;
}): number {
  const days = daysBetween(args.startDate, args.endDate);
  return days <= 0 ? 0 : ((args.targetWeightKg - args.startWeightKg) / days) * DAYS_PER_WEEK;
}
