import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { mealSchema } from './entry';
import {
  aiMealParseJsonSchema,
  aiMealParseSchema,
  createEntriesBatchSchema,
  meFeaturesSchema,
  parseMealTextResponseSchema,
  parseMealTextSchema,
  proposedItemSchema,
  textLogStatusSchema,
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
const food = {
  id: batchItem.foodId,
  source: 'seed',
  createdByMe: false,
  name: 'Arroz cocido',
  brand: null,
  barcode: null,
  kcal: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
  servingG: null,
  servingLabel: null,
};
const proposedItem = {
  key: 'rice',
  meal: 'lunch',
  mealSource: 'default',
  said: 'arroz',
  grams: 150,
  gramsEstimated: true,
  match: 'exact',
  food,
  alternatives: [],
  searchQuery: 'arroz cocido',
};
const textLogStatus = {
  available: true,
  candidates: ['ai'],
  degraded: [],
  checkedAt: '2026-11-17T12:00:00Z',
  freeRemainingToday: 20,
};

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

  it('keeps JSON Schema properties, required lists and limits aligned with Zod', () => {
    const itemJson = aiMealParseJsonSchema.properties.items.items;
    const itemZod = aiMealParseSchema.shape.items.element.shape;
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
    expect(aiMealParseJsonSchema.properties.items.maxItems).toBe(
      z.toJSONSchema(aiMealParseSchema.shape.items).maxItems,
    );
    for (const field of ['said', 'searchQuery', 'grams'] as const) {
      expect(z.toJSONSchema(itemZod[field])).toEqual({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        ...itemJson.properties[field],
      });
    }
    for (const [field, type] of [['catalogIndex', 'integer'], ['units', 'number']] as const) {
      expect(z.toJSONSchema(itemZod[field])).toEqual({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        anyOf: [{ ...itemJson.properties[field], type }, { type: 'null' }],
      });
    }
  });

  it.each([
    [0, true],
    [Number.MAX_SAFE_INTEGER, true],
    [-1, false],
    [0.5, false],
    [Number.MAX_SAFE_INTEGER + 1, false],
  ])('validates catalog index %s with success %s', (catalogIndex, success) => {
    expect(
      aiMealParseSchema.safeParse({
        items: [{ ...aiItem, catalogIndex }],
        otherDayMentioned: false,
      }).success,
    ).toBe(success);
  });

  it.each([0, 3, 4])('checks the proposed item limit with %s alternatives', (count) => {
    expect(
      proposedItemSchema.safeParse({
        ...proposedItem,
        alternatives: Array.from({ length: count }, () => food),
      }).success,
    ).toBe(count <= 3);
  });

  it.each([0, -1, 5000.1, 1.23, NaN, Infinity, '150', null])(
    'rejects invalid proposed item grams %j',
    (grams) => {
      expect(proposedItemSchema.safeParse({ ...proposedItem, grams }).success).toBe(false);
    },
  );

  it.each([0.1, 150, 5000])('accepts valid proposed item grams %s', (grams) => {
    expect(proposedItemSchema.safeParse({ ...proposedItem, grams }).success).toBe(true);
  });

  it('accepts a proposed item with null food', () => {
    const item = { ...proposedItem, food: null, match: 'none' };
    expect(proposedItemSchema.parse(item)).toEqual(item);
  });

  it('accepts concrete and null values for nullable status fields', () => {
    expect(textLogStatusSchema.parse(textLogStatus)).toEqual(textLogStatus);
    const status = { ...textLogStatus, checkedAt: null, freeRemainingToday: null };
    expect(textLogStatusSchema.parse(status)).toEqual(status);
  });

  it.each(['available', 'candidates', 'degraded', 'checkedAt', 'freeRemainingToday'] as const)(
    'requires status field %s',
    (field) => {
      const status: Partial<typeof textLogStatus> = { ...textLogStatus };
      delete status[field];
      expect(textLogStatusSchema.safeParse(status).success).toBe(false);
    },
  );

  it.each(['available', 'candidates', 'degraded'] as const)(
    'rejects null for status field %s',
    (field) => {
      expect(textLogStatusSchema.safeParse({ ...textLogStatus, [field]: null }).success).toBe(
        false,
      );
    },
  );

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
