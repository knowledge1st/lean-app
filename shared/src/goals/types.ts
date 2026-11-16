export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';
export type Profile = {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  activity: ActivityLevel;
};
export type Body = { weightKg: number; bodyFatPct?: number };
export type CompositionPreset = 'cut' | 'recomp' | 'lean_bulk';
export type GoalInput =
  | { mode: 'weight_date'; targetWeightKg: number; targetDate: string }
  | { mode: 'composition'; preset: CompositionPreset }
  | { mode: 'manual'; kcal: number; proteinG: number; carbsG: number; fatG: number };
export type WarningCode =
  | 'rate_capped'
  | 'floor_applied'
  | 'date_unreachable'
  | 'date_in_past'
  | 'already_at_target'
  | 'manual_macros_mismatch';
export type Warning = { code: WarningCode };
export type DailyTargets = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
};
export type MilestoneKind = 'week' | 'month' | 'final';
export type Milestone = { date: string; expectedWeightKg: number; kind: MilestoneKind };
export type Plan = {
  tdee: number | null;
  daily: DailyTargets;
  weekly: { kcalBudget: number; expectedWeightChangeKg: number | null };
  milestones: Milestone[];
  warnings: Warning[];
  adjusted?: { targetDate: string };
};
