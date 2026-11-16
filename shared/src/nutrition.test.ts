import { describe, expect, it } from 'vitest';
import {
  macrosForGrams,
  per100gFromServing,
  roundMacros,
  scaleMacros,
  sumMacros,
  ZERO_MACROS,
} from './nutrition';

const food = { kcal: 200, protein: 10.25, carbs: 20.5, fat: 3.15 };
describe('nutrition', () => {
  it('calculates portions without presentation rounding', () => {
    expect(macrosForGrams(food, 150)).toEqual({
      kcal: 300,
      protein: 15.375,
      carbs: 30.75,
      fat: 4.725,
    });
    expect(macrosForGrams(food, 33.3).protein).toBeCloseTo(3.41325, 10);
  });
  it('converts label values per serving to values per 100 g', () => {
    expect(per100gFromServing({ kcal: 100, protein: 3, carbs: 12.5, fat: 4 }, 25)).toEqual({
      kcal: 400,
      protein: 12,
      carbs: 50,
      fat: 16,
    });
  });
  it('rounds converted calories to integers and macros to two decimals', () => {
    expect(per100gFromServing({ kcal: 100, protein: 1, carbs: 2, fat: 3 }, 30)).toEqual({
      kcal: 333,
      protein: 3.33,
      carbs: 6.67,
      fat: 10,
    });
    expect(per100gFromServing({ kcal: 1, protein: 1.005, carbs: 0, fat: 0 }, 100).protein).toBe(
      1.01,
    );
  });
  it('preserves schema-compatible values for a 100 g serving', () => {
    expect(per100gFromServing(food, 100)).toEqual(food);
  });
  it('scales stored macros in both directions', () => {
    const scaled = scaleMacros(food, 100, 250);
    expect(scaled).toEqual({ kcal: 500, protein: 25.625, carbs: 51.25, fat: 7.875 });
    expect(scaleMacros(scaled, 250, 100)).toEqual(food);
  });
  it.each([0, -1, NaN, Infinity, -Infinity])('rejects invalid grams %s', (grams) => {
    expect(() => macrosForGrams(food, grams)).toThrow(RangeError);
    expect(() => per100gFromServing(food, grams)).toThrow(RangeError);
    expect(() => scaleMacros(food, grams, 100)).toThrow(RangeError);
    expect(() => scaleMacros(food, 100, grams)).toThrow(RangeError);
  });
  it('sums raw values and returns independent zeros for empty arrays', () => {
    expect(sumMacros([])).toEqual(ZERO_MACROS);
    expect(sumMacros([])).not.toBe(ZERO_MACROS);
    expect(sumMacros([food, food])).toEqual({ kcal: 400, protein: 20.5, carbs: 41, fat: 6.3 });
  });
  it('sums stored four-decimal values exactly before presentation rounding', () => {
    const total = sumMacros([
      { kcal: 0, protein: 0.005, carbs: 0, fat: 0 },
      { kcal: 0, protein: 0.045, carbs: 0, fat: 0 },
    ]);
    expect(total.protein).toBe(0.05);
    expect(roundMacros(total).protein).toBe(0.1);
  });
  it('rounds kcal and macros and removes negative zero', () => {
    expect(roundMacros({ kcal: 66.6, protein: 3.41325, carbs: 0.15, fat: -0.01 })).toEqual({
      kcal: 67,
      protein: 3.4,
      carbs: 0.2,
      fat: 0,
    });
    for (const value of Object.values(
      roundMacros({ kcal: -0.1, protein: -0, carbs: -0.01, fat: 0 }),
    ))
      expect(Object.is(value, -0)).toBe(false);
  });
});
