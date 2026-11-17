import { describe, expect, it } from 'vitest';
import { calcWaterMl, rebalanceMacrosForKcal, splitMacros } from './macros';

describe('splitMacros', () => {
  it('allocates protein and fat before carbohydrates', () => {
    // P = 2·80 = 160; F = .8·80 = 64; C = (2300 − 640 − 576)/4 = 271.
    expect(splitMacros(2300, 80, 2)).toEqual({ proteinG: 160, carbsG: 271, fatG: 64 });
  });
  it('scales protein and fat together when calories do not cover them', () => {
    // P = 200; F = 80; base = 4·200 + 9·80 = 1520. Scale 1000/1520:
    // P = 131.5789 → 132; F = 52.6316 → 53; C = 0.
    expect(splitMacros(1000, 100, 2)).toEqual({ proteinG: 132, carbsG: 0, fatG: 53 });
  });
  it('handles exactly zero carbohydrate remainder', () => {
    // 4·160 + 9·64 = 1216, so C = 0 without scaling.
    expect(splitMacros(1216, 80, 2)).toEqual({ proteinG: 160, carbsG: 0, fatG: 64 });
  });
});
describe('calcWaterMl', () => {
  it.each([
    // 35·80 = 2800 → 2750; 35·82 = 2870 → 2750; 35·83 = 2905 → 3000.
    [80, 2750],
    [82, 2750],
    [83, 3000],
    // 35·75 = 2625, exactly halfway → 2750 (Math.round).
    [75, 2750],
  ])('rounds water for %s kg to %s ml', (weight, water) => {
    expect(calcWaterMl(weight)).toBe(water);
  });
});
describe('rebalanceMacrosForKcal', () => {
  it('keeps protein and fat and moves the difference into carbs', () => {
    // C = (2000 − 4·150 − 9·60)/4 = 215.
    expect(rebalanceMacrosForKcal(2000, { proteinG: 150, fatG: 60 })).toEqual({
      proteinG: 150,
      carbsG: 215,
      fatG: 60,
    });
  });
  it('scales protein and fat when calories do not cover them', () => {
    // base = 4·150 + 9·60 = 1140; scale 570/1140 = .5.
    expect(rebalanceMacrosForKcal(570, { proteinG: 150, fatG: 60 })).toEqual({
      proteinG: 75,
      carbsG: 0,
      fatG: 30,
    });
  });
  it('puts every calorie into carbs without protein or fat', () => {
    expect(rebalanceMacrosForKcal(1000, { proteinG: 0, fatG: 0 })).toEqual({
      proteinG: 0,
      carbsG: 250,
      fatG: 0,
    });
  });
});
