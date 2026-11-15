import { describe, expect, it } from 'vitest';
import {
  createEntrySchema,
  entriesQuerySchema,
  gramsSchema,
  localDateSchema,
  updateEntrySchema,
} from './entry';

describe('entry schemas', () => {
  it.each(['2026-11-14', '2024-02-29', '2000-02-29', '2026-12-31', '1900-01-01', '2100-12-31'])(
    'accepts %s',
    (date) => {
      expect(localDateSchema.parse(date)).toBe(date);
    },
  );
  it.each([
    '0000-01-01',
    '1899-12-31',
    '2101-01-01',
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2026-13-01',
    '2026-1-01',
    '2026-00-01',
    '2026-11-00',
    '2026-11-14T00:00:00Z',
    '',
  ])('rejects %s', (date) => {
    const parsed = localDateSchema.safeParse(date);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toBe('Fecha inválida');
  });
  it('accepts exactly 31 inclusive days, rejects 32 and reversed ranges', () => {
    expect(entriesQuerySchema.safeParse({ from: '2026-11-01', to: '2026-12-01' }).success).toBe(
      true,
    );
    expect(entriesQuerySchema.safeParse({ from: '2026-11-01', to: '2026-12-02' }).success).toBe(
      false,
    );
    expect(entriesQuerySchema.safeParse({ from: '2026-11-02', to: '2026-11-01' }).success).toBe(
      false,
    );
    expect(entriesQuerySchema.safeParse({ from: '2026-11-01' }).success).toBe(false);
    expect(entriesQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-01' }).success).toBe(
      true,
    );
  });
  it.each([0, -1, 1e-10, 0.05, 0.04, 5000.1, 5001, 1.23, NaN, Infinity])(
    'rejects grams %s',
    (grams) => {
      expect(gramsSchema.safeParse(grams).success).toBe(false);
    },
  );
  it.each([0.1, 33.3, 5000])('accepts grams %s', (grams) => {
    expect(gramsSchema.parse(grams)).toBe(grams);
  });
  it('defaults to eaten and ignores extra keys like food schemas', () => {
    const input = {
      date: '2026-11-14',
      meal: 'lunch',
      grams: 150,
      foodId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
    };
    expect(createEntrySchema.parse(input)).toEqual({
      date: input.date,
      meal: input.meal,
      grams: 150,
      foodId: input.foodId,
      status: 'eaten',
    });
    expect(updateEntrySchema.safeParse({}).success).toBe(false);
    expect(updateEntrySchema.safeParse({ foodId: input.foodId }).success).toBe(false);
    expect(updateEntrySchema.parse({ grams: 100, foodId: input.foodId })).toEqual({ grams: 100 });
    const empty = updateEntrySchema.safeParse({});
    if (!empty.success) expect(empty.error.issues[0]?.message).toBe('Indicá al menos un campo');
  });
});
