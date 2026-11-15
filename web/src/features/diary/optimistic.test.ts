import { expect, it } from 'vitest';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry, type Food } from '@lean/shared';
import {
  applyDiaryAction,
  recalculateSummary,
  revertDiaryAction,
  type DiaryAction,
} from './optimistic';
const food: Food = {
  id: 'food',
  source: 'seed',
  name: 'Pan',
  brand: null,
  barcode: null,
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  servingG: null,
  servingLabel: null,
};
const summary: DaySummary = {
  date: '2026-11-14',
  target: null,
  eaten: ZERO_MACROS,
  planned: ZERO_MACROS,
  meals: MEALS.map((meal) => ({ meal, entries: [], eaten: ZERO_MACROS, planned: ZERO_MACROS })),
};
const added = applyDiaryAction(summary, {
  kind: 'add',
  date: summary.date,
  meal: 'breakfast',
  food,
  grams: 150,
  temporaryId: 'temp-1',
});
const entry = added.meals[0]!.entries[0]!;
it('agrega una entrada temporal y recalcula sin mutar la respuesta', () => {
  expect(added.eaten).toEqual({ kcal: 300, protein: 15, carbs: 30, fat: 7.5 });
  expect(entry.food.name).toBe('Pan');
  expect(entry.id).toBe('temp-1');
  expect(summary.meals[0]!.entries).toEqual([]);
});
it('edita gramos y mueve entre comidas', () => {
  const result = applyDiaryAction(added, {
    kind: 'edit',
    entry,
    changes: { grams: 50, meal: 'dinner' },
  });
  expect(result.meals[0]!.entries).toHaveLength(0);
  expect(result.meals[3]!.eaten.kcal).toBe(100);
  expect(result.eaten.protein).toBe(5);
});
it('separa planificado y consumido, y marca como comido', () => {
  const planned: Entry = { ...entry, status: 'planned' };
  const result = recalculateSummary(summary, [planned]);
  expect(result.eaten.kcal).toBe(0);
  expect(result.planned.kcal).toBe(300);
  const eaten = applyDiaryAction(result, {
    kind: 'edit',
    entry: planned,
    changes: { status: 'eaten' },
  });
  expect(eaten.eaten.kcal).toBe(300);
  expect(eaten.planned.kcal).toBe(0);
});
it('borra y resta totales', () => {
  const result = applyDiaryAction(added, { kind: 'delete', entry });
  expect(result.eaten).toEqual(ZERO_MACROS);
  expect(result.meals.flatMap((meal) => meal.entries)).toHaveLength(0);
});
it('suma antes de redondear y conserva la meta', () => {
  const target = { kcal: 2000, protein: 100, carbs: 250, fat: 60, waterMl: 2000 };
  const result = recalculateSummary({ ...summary, target }, [
    { ...entry, kcal: 10.4, protein: 0.14 },
    { ...entry, id: 'other', kcal: 10.4, protein: 0.14 },
  ]);
  expect(result.eaten.kcal).toBe(21);
  expect(result.eaten.protein).toBe(0.3);
  expect(result.target).toBe(target);
});

it.each(['add', 'edit', 'delete'] as const)(
  'revierte %s conservando otra alta optimista y recalculando las comidas',
  (kind) => {
    const action: DiaryAction =
      kind === 'add'
        ? { kind, date: summary.date, meal: 'breakfast', food, grams: 150, temporaryId: entry.id }
        : kind === 'edit'
          ? { kind, entry, changes: { grams: 50, meal: 'dinner', status: 'planned' } }
          : { kind, entry };
    const initial = kind === 'add' ? summary : added;
    const concurrent = applyDiaryAction(applyDiaryAction(initial, action), {
      kind: 'add',
      date: summary.date,
      meal: 'lunch',
      food,
      grams: 100,
      temporaryId: 'temp-other',
    });
    const before = structuredClone(concurrent);
    const result = revertDiaryAction(concurrent, action);
    expect(result.meals.flatMap((meal) => meal.entries).map((item) => item.id)).toEqual(
      kind === 'add' ? ['temp-other'] : [entry.id, 'temp-other'],
    );
    expect(result.meals[0]!.entries).toEqual(kind === 'add' ? [] : [entry]);
    expect(result.meals[1]!.eaten.kcal).toBe(200);
    expect(result.meals[3]!.entries).toEqual([]);
    expect(result.eaten).toEqual({
      kcal: kind === 'add' ? 200 : 500,
      protein: kind === 'add' ? 10 : 25,
      carbs: kind === 'add' ? 20 : 50,
      fat: kind === 'add' ? 5 : 12.5,
    });
    expect(result.planned).toEqual(ZERO_MACROS);
    expect(concurrent).toEqual(before);
  },
);
