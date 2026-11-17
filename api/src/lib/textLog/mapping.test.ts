import type { AiMealParse } from '@lean/shared';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { Db } from '../../db/client';
import type { Food } from '../../db/schema';
import { mapItems } from './mapping';

const food: Food = {
  id: crypto.randomUUID(),
  source: 'seed',
  ownerId: null,
  name: 'Huevo duro',
  brand: null,
  barcode: null,
  kcalPer100g: 155,
  proteinPer100g: '12.58',
  carbsPer100g: '1.12',
  fatPer100g: '10.61',
  servingGrams: '50',
  servingLabel: '1 unidad',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const item: AiMealParse['items'][number] = {
  catalogIndex: null,
  meal: null,
  said: '2 huevos',
  searchQuery: 'huevo',
  grams: 123.6,
  gramsStated: false,
  units: null,
  approximate: false,
};
const catalog = [{ index: 0, foodId: food.id, name: food.name }];
const makeDb = (rows: unknown[]) =>
  ({ execute: vi.fn().mockResolvedValue({ rows }) }) as unknown as Db;

describe('text log mapping', () => {
  it('uses valid catalogue indices and excludes chosen food from alternatives in one query', async () => {
    const alternative = { ...food, id: crypto.randomUUID(), name: 'Huevo frito' };
    const db = makeDb([
      { itemIndex: 0, chosen: food, chosenScore: 0.5, food, score: 1 },
      { itemIndex: 0, chosen: food, food: alternative, score: 0.9 },
    ]);
    const [result] = await mapItems(
      db,
      'user',
      { items: [{ ...item, catalogIndex: 0, meal: 'dinner' }], otherDayMentioned: false },
      catalog,
      'lunch',
    );
    expect(result).toMatchObject({
      match: 'exact',
      food: { id: food.id },
      alternatives: [{ id: alternative.id }],
      grams: 124,
      meal: 'dinner',
      mealSource: 'text',
    });
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
  it.each([0.29, 0.3])('checks indexed name coherence with trigram score %s', async (chosenScore) => {
    const db = makeDb([{ itemIndex: 0, chosen: food, chosenScore, food: null, score: null }]);
    const [result] = await mapItems(db, 'user', {
      items: [{ ...item, searchQuery: 'arroz', catalogIndex: 0 }], otherDayMentioned: false,
    }, catalog, 'lunch');
    expect(result?.match).toBe(chosenScore < 0.3 ? 'approximate' : 'exact');
    expect(db.execute).toHaveBeenCalledTimes(1);
    const compiled = new PgDialect().sqlToQuery(vi.mocked(db.execute).mock.calls[0]![0] as SQL);
    expect(compiled.sql).toContain('chosen.score AS "chosenScore"');
    expect(compiled.sql).toContain('similarity(n.query, n.name) AS score');
  });
  it.each([['50', 50], [null, 100]] as const)(
    'uses the serving or 100 g for rules without a quantity (%s)', async (servingGrams, grams) => {
      const [result] = await mapItems(
        makeDb([{ itemIndex: 0, chosen: null, food: { ...food, servingGrams }, score: 1 }]),
        'user', { items: [item], otherDayMentioned: false }, catalog, 'lunch', 'rules',
      );
      expect(result).toMatchObject({ grams, gramsEstimated: true });
    },
  );
  it.each([null, 200])('uses search for null/out-of-range index %s', async (catalogIndex) => {
    const [result] = await mapItems(
      makeDb([{ itemIndex: 0, chosen: null, food, score: 0.8 }]),
      'user',
      { items: [{ ...item, catalogIndex }], otherDayMentioned: false },
      catalog,
      'breakfast',
    );
    expect(result).toMatchObject({ match: 'exact', meal: 'breakfast', mealSource: 'default' });
  });
  it('marks low scores/model substitutions and preserves no match', async () => {
    const db = makeDb([
      { itemIndex: 0, chosen: null, food, score: 0.79 },
      { itemIndex: 1, chosen: food, food: null, score: null },
      { itemIndex: 2, chosen: null, food: null, score: null },
    ]);
    const results = await mapItems(
      db,
      'user',
      {
        items: [item, { ...item, catalogIndex: 0, approximate: true }, item],
        otherDayMentioned: false,
      },
      catalog,
      'snack',
    );
    expect(results.map((result) => result.match)).toEqual(['approximate', 'approximate', 'none']);
    expect(new Set(results.map((result) => result.key)).size).toBe(3);
    expect(results[2]?.food).toBeNull();
    expect(results[2]?.alternatives).toEqual([]);
  });
  it('converts units by serving, respects stated grams, rounds and clamps', async () => {
    const inputs = [
      { ...item, units: 2 },
      { ...item, gramsStated: true, grams: 200.4, units: 2 },
      { ...item, grams: 0.1 },
      { ...item, grams: 5000 },
    ];
    const results = await mapItems(
      makeDb(inputs.map((_, itemIndex) => ({ itemIndex, chosen: null, food, score: 1 }))),
      'user',
      { items: inputs, otherDayMentioned: false },
      catalog,
      'lunch',
    );
    expect(results.map((result) => result.grams)).toEqual([100, 200, 1, 2000]);
    expect(results.map((result) => result.gramsEstimated)).toEqual([true, false, true, true]);
    const [noServing] = await mapItems(
      makeDb([{ itemIndex: 0, chosen: null, food: { ...food, servingGrams: null }, score: 1 }]),
      'user',
      { items: [{ ...item, units: 2 }], otherDayMentioned: false },
      catalog,
      'lunch',
    );
    expect(noServing?.grams).toBe(124);
  });
  it('binds every search and resolved index in one unnest/lateral statement', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    await mapItems(
      { execute } as unknown as Db,
      'session-user',
      {
        items: [
          { ...item, catalogIndex: 0, searchQuery: 'huevo' },
          { ...item, catalogIndex: 99, searchQuery: "tomate'); DROP TABLE foods; --" },
        ],
        otherDayMentioned: false,
      },
      catalog,
      'lunch',
    );
    expect(execute).toHaveBeenCalledTimes(1);
    const compiled = new PgDialect().sqlToQuery(execute.mock.calls[0]![0] as SQL);
    expect(compiled.sql).toContain('unnest(ARRAY[$1, $2]::text[], ARRAY[$3, $4]::uuid[])');
    expect(compiled.params.slice(0, 4)).toEqual([
      'huevo',
      "tomate'); DROP TABLE foods; --",
      food.id,
      null,
    ]);
    expect(compiled.sql).toContain('LEFT JOIN LATERAL');
    expect(compiled.sql).toContain('LIMIT 4');
    // Both the catalogue choice and alternatives must pass the same admission filter.
    const minimumScore =
      'greatest(strict_word_similarity(n.query, n.name), strict_word_similarity(n.query, n.brand)) >= 0.4';
    expect(compiled.sql.split(minimumScore)).toHaveLength(3);
    const wordPrefix = 'starts_with(substr(n.name, position.value), n.query)';
    expect(compiled.sql.split(wordPrefix)).toHaveLength(3);
    expect(compiled.sql).toContain(
      "position.value = 1 OR substr(n.name, position.value - 1, 1) !~ '[[:alnum:]_]'",
    );
    expect(compiled.sql).not.toContain('greatest(word_similarity');
    expect(compiled.sql).not.toContain('strpos');
    expect(compiled.sql).not.toContain('DROP TABLE');
    expect(compiled.params).toContain('session-user');
  });
  it('skips database work for an empty parse', async () => {
    const db = makeDb([]);
    expect(
      await mapItems(db, 'user', { items: [], otherDayMentioned: false }, catalog, 'lunch'),
    ).toEqual([]);
    expect(db.execute).not.toHaveBeenCalled();
  });
});
