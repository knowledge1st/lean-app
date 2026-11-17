import { aiMealParseSchema } from '@lean/shared';
import { describe, expect, it } from 'vitest';
import { textLogFixtures } from './fixtures';
import { parseWithRules } from './rules';

describe('rules interpreter', () => {
  it('assigns the objective spans to dinner, breakfast and lunch', () => {
    const result = parseWithRules(textLogFixtures[0]!.text);
    expect(result.items.map((item) => item.meal)).toEqual([
      'dinner',
      'dinner',
      'dinner',
      'breakfast',
      'breakfast',
      'breakfast',
      'lunch',
      'lunch',
      'lunch',
      'lunch',
      'lunch',
    ]);
    expect(result.items[3]?.said).toBe('café');
    expect(aiMealParseSchema.safeParse(result).success).toBe(true);
  });
  it('splits a simple list, semicolons and newlines', () => {
    expect(parseWithRules('arroz, pollo, tomate').items.map((i) => i.searchQuery)).toEqual([
      'arroz',
      'pollo',
      'tomate',
    ]);
    expect(parseWithRules('arroz; pollo\ntomate').items).toHaveLength(3);
  });
  it.each(['200 g de arroz', '200g de arroz', '200 gramos de arroz'])(
    'recognizes explicit grams %s',
    (text) => {
      expect(parseWithRules(text).items[0]).toMatchObject({
        searchQuery: 'arroz',
        grams: 200,
        gramsStated: true,
        units: null,
      });
    },
  );
  it.each(['200,5 g de arroz', '200,5g de arroz', '200,5 gramos de arroz'])(
    'recognizes decimal-comma grams %s',
    (text) => {
      const result = parseWithRules(text);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        said: text,
        searchQuery: 'arroz',
        grams: 200.5,
        gramsStated: true,
        units: null,
      });
      expect(aiMealParseSchema.safeParse(result).success).toBe(true);
    },
  );
  it('preserves decimal commas while splitting a list and propagating meals', () => {
    const result = parseWithRules('almorcé 200,5 g de arroz,1,5 huevos; pollo\ntomate');
    expect(result.items.map((item) => item.searchQuery)).toEqual([
      'arroz',
      'huevos',
      'pollo',
      'tomate',
    ]);
    expect(result.items.map((item) => item.meal)).toEqual(['lunch', 'lunch', 'lunch', 'lunch']);
    expect(result.items[0]).toMatchObject({ grams: 200.5, gramsStated: true, units: null });
    expect(result.items[1]).toMatchObject({ grams: 100, gramsStated: false, units: 1.5 });
    expect(aiMealParseSchema.safeParse(result).success).toBe(true);
  });
  it.each([
    ['2 huevos', 2],
    ['1,5 huevos', 1.5],
    ['media pizza', 0.5],
    ['1/2 pizza', 0.5],
    ['medio tomate', 0.5],
    ['diez huevos', 10],
  ])('recognizes units %s', (text, units) => {
    expect(parseWithRules(String(text)).items[0]).toMatchObject({
      units,
      grams: 100,
      gramsStated: false,
    });
  });
  it.each([
    'pechuga con arroz de cena',
    'pechuga con arroz de cena.',
    'de cena pechuga con arroz',
    'para el cena pechuga con arroz',
    'en el cena pechuga con arroz',
  ])('assigns meal for %s', (text) => {
    expect(parseWithRules(text).items.map((i) => i.meal)).toEqual(['dinner', 'dinner']);
  });
  it.each([
    'desayuné',
    'desayune',
    'almorcé',
    'almorce',
    'merendé',
    'merende',
    'cené',
    'cene',
    'colación',
    'picoteo',
  ])('recognizes meal %s', (meal) => {
    expect(parseWithRules(`${meal} arroz`).items[0]?.meal).not.toBeNull();
  });
  it('propagates meals until the next marker and flags days', () => {
    const result = parseWithRules('ayer me comí arroz de almuerzo, tomate, cené dos huevos');
    expect(result.otherDayMentioned).toBe(true);
    expect(result.items.map((i) => i.meal)).toEqual(['lunch', 'lunch', 'dinner']);
    expect(result.items[0]?.searchQuery).toBe('arroz');
    for (const day of ['anoche', 'mañana', 'miércoles', 'sábado'])
      expect(parseWithRules(`${day} arroz`).otherDayMentioned).toBe(true);
  });
  it('returns no items for meal/day markers, empty text or quantities alone', () => {
    for (const text of ['', 'ayer', 'desayuné', '200 g', ', ;'])
      expect(parseWithRules(text).items).toEqual([]);
  });
  it('bounds output and always produces the AI contract for supported quantities', () => {
    const result = parseWithRules(Array.from({ length: 40 }, () => 'una manzana').join(','));
    expect(result.items).toHaveLength(30);
    expect(result.items.every((item) => item.catalogIndex === null && !item.approximate)).toBe(
      true,
    );
    expect(aiMealParseSchema.safeParse(result).success).toBe(true);
  });
});
