import {
  ACTIVITY_FACTORS,
  KATCH_BASE_KCAL,
  KATCH_LEAN_MASS_FACTOR,
  MIFFLIN_AGE_FACTOR,
  MIFFLIN_HEIGHT_FACTOR,
  MIFFLIN_SEX_OFFSET,
  MIFFLIN_WEIGHT_FACTOR,
  PERCENT_SCALE,
} from './constants';
import type { Body, Profile } from './types';

export function calcAge(birthDate: string, today: string): number {
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return years - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
}

export function calcBmr(profile: Profile, body: Body, today: string): number {
  if (body.bodyFatPct !== undefined) {
    return (
      KATCH_BASE_KCAL +
      KATCH_LEAN_MASS_FACTOR * body.weightKg * (1 - body.bodyFatPct / PERCENT_SCALE)
    );
  }
  return (
    MIFFLIN_WEIGHT_FACTOR * body.weightKg +
    MIFFLIN_HEIGHT_FACTOR * profile.heightCm -
    MIFFLIN_AGE_FACTOR * calcAge(profile.birthDate, today) +
    MIFFLIN_SEX_OFFSET[profile.sex]
  );
}

export function calcTdee(profile: Profile, body: Body, today: string): number {
  return calcBmr(profile, body, today) * ACTIVITY_FACTORS[profile.activity];
}
