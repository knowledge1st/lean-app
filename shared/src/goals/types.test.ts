import { expectTypeOf, it } from 'vitest';
import type {
  ActivityLevel,
  Body,
  CompositionPreset,
  DailyTargets,
  GoalInput,
  Milestone,
  MilestoneKind,
  Plan,
  Profile,
  Sex,
  Warning,
  WarningCode,
} from './types';

it('preserves the public type contracts', () => {
  expectTypeOf<Sex>().toEqualTypeOf<'male' | 'female'>();
  expectTypeOf<ActivityLevel>().toEqualTypeOf<'sedentary' | 'light' | 'moderate' | 'active'>();
  expectTypeOf<CompositionPreset>().toEqualTypeOf<'cut' | 'recomp' | 'lean_bulk'>();
  expectTypeOf<Profile>().toEqualTypeOf<{
    sex: Sex;
    birthDate: string;
    heightCm: number;
    activity: ActivityLevel;
  }>();
  expectTypeOf<Body>().toEqualTypeOf<{ weightKg: number; bodyFatPct?: number }>();
  expectTypeOf<GoalInput>().toEqualTypeOf<
    | { mode: 'weight_date'; targetWeightKg: number; targetDate: string }
    | { mode: 'composition'; preset: CompositionPreset }
    | { mode: 'manual'; kcal: number; proteinG: number; carbsG: number; fatG: number }
  >();
  expectTypeOf<WarningCode>().toEqualTypeOf<
    | 'rate_capped'
    | 'floor_applied'
    | 'date_unreachable'
    | 'date_in_past'
    | 'already_at_target'
    | 'manual_macros_mismatch'
  >();
  expectTypeOf<Warning>().toEqualTypeOf<{ code: WarningCode }>();
  expectTypeOf<MilestoneKind>().toEqualTypeOf<'week' | 'month' | 'final'>();
  expectTypeOf<Milestone>().toEqualTypeOf<{
    date: string;
    expectedWeightKg: number;
    kind: MilestoneKind;
  }>();
  expectTypeOf<Plan>().toEqualTypeOf<{
    tdee: number | null;
    daily: DailyTargets;
    weekly: { kcalBudget: number; expectedWeightChangeKg: number | null };
    milestones: Milestone[];
    warnings: Warning[];
    adjusted?: { targetDate: string };
  }>();
  expectTypeOf<DailyTargets>().toEqualTypeOf<{
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
  }>();
});
