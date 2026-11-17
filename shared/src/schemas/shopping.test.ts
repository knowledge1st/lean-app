import { describe, expect, it } from 'vitest';
import {
  createShoppingItemSchema,
  generateShoppingSchema,
  shoppingItemSchema,
  shoppingWeekQuerySchema,
  updateShoppingItemSchema,
} from './shopping';
describe('shopping schemas', () => {
  it('accepts responses and trims manual labels', () => {
    expect(
      shoppingItemSchema.safeParse({
        id: crypto.randomUUID(),
        foodId: null,
        label: 'Sal',
        totalGrams: null,
        checked: false,
        manual: true,
      }).success,
    ).toBe(true);
    expect(
      createShoppingItemSchema.parse({ week: '2026-W53', label: ' Sal ', quantity: 100000 }).label,
    ).toBe('Sal');
    expect(createShoppingItemSchema.safeParse({ week: '2026-W53', label: 'Sal' }).success).toBe(
      true,
    );
    expect(updateShoppingItemSchema.parse({ quantity: null })).toEqual({ quantity: null });
    expect(updateShoppingItemSchema.safeParse({ checked: false }).success).toBe(true);
    expect(updateShoppingItemSchema.parse({ label: ' Sal ', quantity: 0.1 })).toEqual({
      label: 'Sal',
      quantity: 0.1,
    });
  });
  it.each([0, -1, 100000.1, 1.11, '100', null, Infinity, NaN])(
    'rejects quantity %s',
    (quantity) => {
      expect(
        createShoppingItemSchema.safeParse({ week: '2026-W53', label: 'Sal', quantity }).success,
      ).toBe(false);
      if (quantity !== null)
        expect(updateShoppingItemSchema.safeParse({ quantity }).success).toBe(false);
    },
  );
  it.each(['', '  ', 'x'.repeat(121)])('rejects label %s', (label) => {
    expect(createShoppingItemSchema.safeParse({ week: '2026-W53', label }).success).toBe(false);
    expect(updateShoppingItemSchema.safeParse({ label }).success).toBe(false);
  });
  it('rejects empty patches, invalid booleans and invalid weeks', () => {
    expect(updateShoppingItemSchema.safeParse({}).success).toBe(false);
    expect(updateShoppingItemSchema.safeParse({ checked: 'true' }).success).toBe(false);
    for (const schema of [
      shoppingWeekQuerySchema,
      generateShoppingSchema,
      createShoppingItemSchema,
    ])
      expect(schema.safeParse({ week: '2021-W53', label: 'Sal' }).success).toBe(false);
  });
});
