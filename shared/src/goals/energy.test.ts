import { describe, expect, it } from 'vitest';
import { calcAge, calcBmr, calcTdee } from './energy';
import type { Body, Profile } from './types';

const today = '2026-01-05';
describe('calcAge', () => {
  it.each([
    ['1996-01-01', 30],
    ['1996-01-05', 30],
    ['1996-01-06', 29],
  ])('counts completed birthdays for %s', (birthDate, expected) => {
    // 2026 − 1996 = 30; subtract 1 only if January 5 precedes the birthday.
    expect(calcAge(birthDate, today)).toBe(expected);
  });
  it('uses the calendar anniversary for leap-day birthdays', () => {
    // 2025 − 2000 = 25; February 28 precedes 02-29, March 1 follows it.
    expect(calcAge('2000-02-29', '2025-02-28')).toBe(24);
    expect(calcAge('2000-02-29', '2025-03-01')).toBe(25);
  });
});

describe('energy formulas', () => {
  const cases: { profile: Profile; body: Body; bmr: number; tdee: number }[] = [
    // Mifflin male: 10·80 + 6.25·180 − 5·30 + 5 = 1780; ×1.55 = 2759.
    {
      profile: { sex: 'male', birthDate: '1996-01-05', heightCm: 180, activity: 'moderate' },
      body: { weightKg: 80 },
      bmr: 1780,
      tdee: 2759,
    },
    // Mifflin female: 10·60 + 6.25·165 − 5·30 − 161 = 1320.25; ×1.2 = 1584.3.
    {
      profile: { sex: 'female', birthDate: '1996-01-05', heightCm: 165, activity: 'sedentary' },
      body: { weightKg: 60 },
      bmr: 1320.25,
      tdee: 1584.3,
    },
    // Katch male: 370 + 21.6·80·(1 − 20/100) = 1752.4; ×1.725 = 3022.89.
    {
      profile: { sex: 'male', birthDate: '1996-01-05', heightCm: 180, activity: 'active' },
      body: { weightKg: 80, bodyFatPct: 20 },
      bmr: 1752.4,
      tdee: 3022.89,
    },
    // Katch female: 370 + 21.6·60·(1 − 25/100) = 1342; ×1.375 = 1845.25.
    {
      profile: { sex: 'female', birthDate: '1996-01-05', heightCm: 165, activity: 'light' },
      body: { weightKg: 60, bodyFatPct: 25 },
      bmr: 1342,
      tdee: 1845.25,
    },
  ];
  it.each(cases)('keeps unrounded BMR and TDEE for $profile.sex / $profile.activity', (entry) => {
    expect(calcBmr(entry.profile, entry.body, today)).toBeCloseTo(entry.bmr, 10);
    expect(calcTdee(entry.profile, entry.body, today)).toBeCloseTo(entry.tdee, 10);
  });
  it('treats zero percent body fat as supplied', () => {
    // Katch: 370 + 21.6·80 = 2098 (not Mifflin's 1780).
    expect(calcBmr(cases[0]!.profile, { weightKg: 80, bodyFatPct: 0 }, today)).toBe(2098);
  });
});
