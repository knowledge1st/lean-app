import { describe, expect, it } from 'vitest';
import {
  barcodeSchema,
  createFoodSchema,
  foodListQuerySchema,
  foodSearchQuerySchema,
  updateFoodSchema,
} from './food';
const food = { name: ' Comida ', kcal: 150, protein: 10.25, carbs: 20, fat: 3 };
describe('food schemas', () => {
  it('trims fields and omits an empty brand', () => {
    expect(createFoodSchema.parse({ ...food, brand: ' ' })).toEqual({
      ...food,
      name: 'Comida',
      brand: undefined,
    });
  });
  it.each([
    { protein: 10.251 },
    { servingG: 1.11, servingLabel: 'porción' },
    { protein: 90 },
    { servingG: 10 },
    { servingLabel: 'porción' },
    { servingG: 0, servingLabel: 'porción' },
    { kcal: 901 },
    { name: ' ' },
  ])('rejects invalid fields %j', (patch) => {
    expect(createFoodSchema.safeParse({ ...food, ...patch }).success).toBe(false);
  });
  it('accepts partial updates and clearing nullable fields; rejects empty patches', () => {
    expect(updateFoodSchema.parse({ protein: 80, servingG: null, brand: null })).toEqual({
      protein: 80,
      servingG: null,
      brand: null,
    });
    expect(updateFoodSchema.safeParse({}).success).toBe(false);
  });
  it('validates barcodes and query limits', () => {
    expect(barcodeSchema.safeParse('12345678').success).toBe(true);
    for (const code of ['123', '1234567a', '123456789012345'])
      expect(barcodeSchema.safeParse(code).success).toBe(false);
    expect(foodSearchQuerySchema.parse({ q: ' pollo ' })).toEqual({ q: 'pollo', limit: 20 });
    expect(foodListQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(foodListQuerySchema.parse({ limit: '50' })).toEqual({ limit: 50 });
    expect(foodListQuerySchema.safeParse({ limit: '1.5' }).success).toBe(false);
  });
});
