import { expect, it } from 'vitest';
import {
  ACTIVITY_FACTORS,
  KCAL_FLOORS,
  KCAL_PER_KG,
  MAX_GAIN_PCT_PER_WEEK,
  MAX_LOSS_PCT_PER_WEEK,
  PRESET_KCAL_PCT,
  PRESET_PROTEIN_PER_KG,
} from './constants';

it('exposes the specified policy constants', () => {
  // 1 kg/week = 7700/7 = 1100 kcal/day; caps for 80 kg are .8 loss and .4 gain.
  expect(KCAL_PER_KG / 7).toBe(1100);
  expect(MAX_LOSS_PCT_PER_WEEK * 80).toBe(0.8);
  expect(MAX_GAIN_PCT_PER_WEEK * 80).toBe(0.4);
  expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 });
  expect(KCAL_FLOORS).toEqual({ female: 1200, male: 1500 });
  expect(PRESET_KCAL_PCT).toEqual({ cut: -0.2, recomp: -0.05, lean_bulk: 0.1 });
  expect(PRESET_PROTEIN_PER_KG).toEqual({ cut: 2.2, recomp: 2, lean_bulk: 1.8 });
});
