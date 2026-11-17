import { describe, expect, it } from 'vitest';
import { foodEntryMacros, storageNumeric } from './entryMacros';

describe('storageNumeric', () => {
  it.each([
    [0, '0'],
    [12, '12'],
    [1.23444, '1.2344'],
    [1.234449, '1.2344'],
    [1.23445, '1.2345'],
    [1.234451, '1.2345'],
    [0.04995, '0.05'],
    [0.14985, '0.1499'],
    [0.24975, '0.2498'],
    [0.00005, '0.0001'],
    [0.000049, '0'],
  ])('preserves the existing storage rounding for %s', (value, expected) => {
    expect(storageNumeric(value)).toBe(expected);
  });
});

describe('foodEntryMacros', () => {
  it('preserves four-place storage values for decimal grams and food macros', () => {
    expect(
      foodEntryMacros(
        { kcalPer100g: 130, proteinPer100g: '2.69', carbsPer100g: '28.17', fatPer100g: '0.28' },
        33.3,
      ),
    ).toEqual({ kcal: '43.29', protein: '0.8958', carbs: '9.3806', fat: '0.0932' });
  });

  it('preserves decimal half-up ties despite binary scaling noise', () => {
    expect(
      foodEntryMacros(
        { kcalPer100g: 1, proteinPer100g: '0.15', carbsPer100g: '0.45', fatPer100g: '0.75' },
        33.3,
      ),
    ).toEqual({ kcal: '0.333', protein: '0.05', carbs: '0.1499', fat: '0.2498' });
  });

  it('stores zero macros as strings', () => {
    expect(
      foodEntryMacros(
        { kcalPer100g: 0, proteinPer100g: '0.00', carbsPer100g: '0.00', fatPer100g: '0.00' },
        100,
      ),
    ).toEqual({ kcal: '0', protein: '0', carbs: '0', fat: '0' });
  });
});
