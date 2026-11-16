import {
  CARBS_KCAL_PER_G,
  DAYS_PER_WEEK,
  DEFAULT_PROTEIN_PER_KG,
  FAT_KCAL_PER_G,
  KCAL_FLOORS,
  KCAL_PER_KG,
  KCAL_ROUNDING_STEP,
  MANUAL_MACROS_TOLERANCE,
  MAX_GAIN_PCT_PER_WEEK,
  MAX_LOSS_PCT_PER_WEEK,
  PLAN_PRECISION_EPSILON,
  PRESET_KCAL_PCT,
  PRESET_PROTEIN_PER_KG,
  PROTEIN_KCAL_PER_G,
  TARGET_WEIGHT_TOLERANCE_KG,
  WEIGHT_DECIMAL_FACTOR,
  WEIGHT_DELTA_DECIMAL_FACTOR,
} from './constants';
import { addDays, daysBetween } from './dates';
import { calcTdee } from './energy';
import { calcWaterMl, splitMacros } from './macros';
import { buildMilestones } from './milestones';
import type { Body, GoalInput, Plan, Profile, WarningCode } from './types';

const roundKcal = (kcal: number) => Math.round(kcal / KCAL_ROUNDING_STEP) * KCAL_ROUNDING_STEP;
const roundWeight = (weight: number) =>
  Math.round(weight * WEIGHT_DECIMAL_FACTOR) / WEIGHT_DECIMAL_FACTOR || 0;

export function buildPlan(profile: Profile, body: Body, goal: GoalInput, today: string): Plan {
  const waterMl = calcWaterMl(body.weightKg);
  const warningCodes = new Set<WarningCode>();
  if (goal.mode === 'manual') {
    const macrosKcal =
      PROTEIN_KCAL_PER_G * goal.proteinG +
      CARBS_KCAL_PER_G * goal.carbsG +
      FAT_KCAL_PER_G * goal.fatG;
    if (Math.abs(macrosKcal - goal.kcal) > MANUAL_MACROS_TOLERANCE * goal.kcal) {
      warningCodes.add('manual_macros_mismatch');
    }
    const kcal = Math.round(goal.kcal);
    return {
      tdee: null,
      daily: {
        kcal,
        proteinG: Math.round(goal.proteinG),
        carbsG: Math.round(goal.carbsG),
        fatG: Math.round(goal.fatG),
        waterMl,
      },
      weekly: { kcalBudget: kcal * DAYS_PER_WEEK, expectedWeightChangeKg: null },
      milestones: [],
      warnings: [...warningCodes].map((code) => ({ code })),
    };
  }

  const tdee = calcTdee(profile, body, today);
  const floor = KCAL_FLOORS[profile.sex];
  let kcal = tdee;
  let proteinPerKg: number = DEFAULT_PROTEIN_PER_KG;
  let rate = 0;
  let endDate: string | undefined;
  let adjusted: Plan['adjusted'];

  if (goal.mode === 'composition') {
    kcal = tdee * (1 + PRESET_KCAL_PCT[goal.preset]);
    proteinPerKg = PRESET_PROTEIN_PER_KG[goal.preset];
  } else {
    const delta =
      Math.round((goal.targetWeightKg - body.weightKg) * WEIGHT_DELTA_DECIMAL_FACTOR) /
      WEIGHT_DELTA_DECIMAL_FACTOR;
    const days = daysBetween(today, goal.targetDate);
    if (Math.abs(delta) < TARGET_WEIGHT_TOLERANCE_KG) {
      warningCodes.add('already_at_target');
      if (days <= 0) warningCodes.add('date_in_past');
    } else {
      const maxRate = body.weightKg * (delta < 0 ? MAX_LOSS_PCT_PER_WEEK : MAX_GAIN_PCT_PER_WEEK);
      let changed = days <= 0;
      if (days <= 0) {
        warningCodes.add('date_in_past');
        rate = Math.sign(delta) * maxRate;
      } else {
        rate = (delta / days) * DAYS_PER_WEEK;
        if (Math.abs(rate) > maxRate + PLAN_PRECISION_EPSILON) {
          rate = Math.sign(delta) * maxRate;
          warningCodes.add('rate_capped');
          changed = true;
        }
      }
      kcal = tdee + (rate * KCAL_PER_KG) / DAYS_PER_WEEK;
      if (kcal < floor) {
        kcal = floor;
        warningCodes.add('floor_applied');
        rate = ((floor - tdee) * DAYS_PER_WEEK) / KCAL_PER_KG;
        changed = true;
      }
      if (delta < 0 && tdee <= floor) {
        warningCodes.add('date_unreachable');
      } else {
        if (changed) {
          const viableDays = Math.ceil(
            (Math.abs(delta) / Math.abs(rate)) * DAYS_PER_WEEK - PLAN_PRECISION_EPSILON,
          );
          adjusted = { targetDate: addDays(today, viableDays) };
        }
        endDate = adjusted?.targetDate ?? goal.targetDate;
      }
    }
  }

  if (kcal < floor) {
    kcal = floor;
    warningCodes.add('floor_applied');
  }
  kcal = Math.max(floor, roundKcal(kcal));
  if (goal.mode === 'composition') rate = ((kcal - tdee) * DAYS_PER_WEEK) / KCAL_PER_KG;

  return {
    tdee: roundKcal(tdee),
    daily: { kcal, ...splitMacros(kcal, body.weightKg, proteinPerKg), waterMl },
    weekly: { kcalBudget: kcal * DAYS_PER_WEEK, expectedWeightChangeKg: roundWeight(rate) },
    milestones:
      goal.mode === 'weight_date' && endDate !== undefined
        ? buildMilestones({
            startDate: today,
            startWeightKg: body.weightKg,
            targetWeightKg: goal.targetWeightKg,
            endDate,
          })
        : [],
    warnings: [...warningCodes].map((code) => ({ code })),
    ...(adjusted === undefined ? {} : { adjusted }),
  };
}
