import { describe, expect, it } from 'vitest';
import { mealSchema } from './entry';
import {
  aiMealParseJsonSchema,
  aiMealParseSchema,
  createEntriesBatchSchema,
  meFeaturesSchema,
  parseMealTextResponseSchema,
  parseMealTextSchema,
  TEXT_LOG_DAILY_LIMIT,
  TEXT_LOG_MAX_CHARS,
  TEXT_LOG_MAX_ITEMS,
} from './textLog';

const request = { text: 'arroz', date: '2026-11-17', defaultMeal: 'lunch' };
const aiItem = {
  meal: null,
  said: 'arroz',
  catalogIndex: null,
  searchQuery: 'arroz cocido',
  grams: 150,
  gramsStated: false,
  units: null,
  approximate: false,
};
const batchItem = {
  meal: 'lunch',
  foodId: '00000000-0000-4000-8000-000000000001',
  grams: 150,
};
const batch = { date: request.date, status: 'eaten', items: [batchItem] };

describe('text log schemas', () => {
  it('exports the agreed limits', () => {
    expect(TEXT_LOG_MAX_CHARS).toBe(1000);
    expect(TEXT_LOG_MAX_ITEMS).toBe(30);
    expect(TEXT_LOG_DAILY_LIMIT).toBe(20);
  });

  it('trims text, accepts 1000 characters and rejects 1001', () => {
    expect(parseMealTextSchema.parse({ ...request, text: '  arroz  ' }).text).toBe('arroz');
    expect(parseMealTextSchema.safeParse({ ...request, text: 'a'.repeat(1000) }).success).toBe(
      true,
    );
    expect(parseMealTextSchema.safeParse({ ...request, text: 'a'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it.each(['', '   ', '\n\t '])('rejects empty text after trimming %j', (text) => {
    const result = parseMealTextSchema.safeParse({ ...request, text });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Escribí qué comiste');
  });

  it.each([0, 30, 31])('checks the AI item limit with %s items', (count) => {
    expect(
      aiMealParseSchema.safeParse({
        items: Array.from({ length: count }, () => aiItem),
        otherDayMentioned: false,
      }).success,
    ).toBe(count <= 30);
  });

  it.each([0, 1, 30, 31])('checks the batch item limits with %s items', (count) => {
    expect(
      createEntriesBatchSchema.safeParse({
        ...batch,
        items: Array.from({ length: count }, () => batchItem),
      }).success,
    ).toBe(count >= 1 && count <= 30);
  });

  it('rejects a batch food ID that is not a UUID', () => {
    expect(
      createEntriesBatchSchema.safeParse({
        ...batch,
        items: [{ ...batchItem, foodId: 'arroz' }],
      }).success,
    ).toBe(false);
  });

  it('accepts null and concrete values for nullable AI fields', () => {
    const items = [aiItem, { ...aiItem, meal: 'lunch', catalogIndex: 0, units: 2 }];
    expect(aiMealParseSchema.parse({ items, otherDayMentioned: true })).toEqual({
      items,
      otherDayMentioned: true,
    });
  });

  it.each(['meal', 'catalogIndex', 'units'] as const)('requires nullable field %s', (field) => {
    const item = { ...aiItem };
    delete (item as Partial<typeof aiItem>)[field];
    expect(aiMealParseSchema.safeParse({ items: [item], otherDayMentioned: false }).success).toBe(
      false,
    );
  });

  it('keeps JSON Schema properties and required lists aligned with Zod shapes', () => {
    const itemJson = aiMealParseJsonSchema.properties.items.items;
    const rootKeys = Object.keys(aiMealParseSchema.shape).sort();
    const itemKeys = Object.keys(aiMealParseSchema.shape.items.element.shape).sort();
    expect(Object.keys(aiMealParseJsonSchema.properties).sort()).toEqual(rootKeys);
    expect([...aiMealParseJsonSchema.required].sort()).toEqual(rootKeys);
    expect(Object.keys(itemJson.properties).sort()).toEqual(itemKeys);
    expect([...itemJson.required].sort()).toEqual(itemKeys);
    expect(aiMealParseJsonSchema.additionalProperties).toBe(false);
    expect(itemJson.additionalProperties).toBe(false);
    expect(itemJson.properties.meal.anyOf).toEqual([
      { type: 'string', enum: mealSchema.options },
      { type: 'null' },
    ]);
    expect(itemJson.properties.catalogIndex.type).toEqual(['integer', 'null']);
    expect(itemJson.properties.units.type).toEqual(['number', 'null']);
  });

  it.each(['ai', 'rules'])('accepts interpreter %s', (interpreter) => {
    const response = { items: [], warnings: [], remainingToday: 0, interpreter };
    expect(parseMealTextResponseSchema.parse(response)).toEqual(response);
  });

  it('requires a supported interpreter and a nonnegative integer remaining quota', () => {
    const response = { items: [], warnings: [], remainingToday: 20 };
    expect(parseMealTextResponseSchema.safeParse(response).success).toBe(false);
    expect(
      parseMealTextResponseSchema.safeParse({ ...response, interpreter: 'other' }).success,
    ).toBe(false);
    for (const remainingToday of [-1, 0.5]) {
      expect(
        parseMealTextResponseSchema.safeParse({
          ...response,
          interpreter: 'rules',
          remainingToday,
        }).success,
      ).toBe(false);
    }
  });

  it('validates both feature flags independently', () => {
    expect(meFeaturesSchema.parse({ textLog: true, textLogAi: false })).toEqual({
      textLog: true,
      textLogAi: false,
    });
    expect(meFeaturesSchema.safeParse({ textLog: true }).success).toBe(false);
  });
});
