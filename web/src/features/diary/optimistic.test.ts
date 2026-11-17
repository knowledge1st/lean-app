import { expect, it } from 'vitest';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry, type Food } from '@lean/shared';
import {
  applyDiaryAction,
  recalculateSummary,
  applyPendingDiaryActions,
  incorporateDiaryResult,
  type DiaryAction,
} from './optimistic';
const food: Food = {
  id: 'food',
  source: 'seed',
  createdByMe: false,
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
  waterMl: 0,
  exerciseKcal: 0,
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

it('aplica pendientes en orden sobre la base sin restaurar campos de una copia optimista', () => {
  const edit: DiaryAction = { kind: 'edit', entry, changes: { grams: 200 } };
  const edited = applyDiaryAction(added, edit).meals[0]!.entries[0]!;
  const move: DiaryAction = { kind: 'edit', entry: edited, changes: { meal: 'dinner' } };
  const result = applyPendingDiaryActions(added, [edit, move]);
  expect(result.meals[3]!.entries[0]).toMatchObject({ grams: 200, meal: 'dinner' });
  expect(applyPendingDiaryActions(added, [move]).meals[3]!.entries[0]).toMatchObject({
    grams: 150,
    meal: 'dinner',
  });
  expect(added.meals[0]!.entries[0]).toBe(entry);
});

it('sin pendientes devuelve exactamente la base con los totales originales del servidor', () => {
  const base = recalculateSummary(summary, [
    { ...entry, kcal: 10 },
    { ...entry, id: 'other', kcal: 10 },
  ]);
  base.eaten = { ...base.eaten, kcal: 21 };
  base.meals[0]!.eaten = base.eaten;
  expect(applyPendingDiaryActions(base, [])).toBe(base);
  expect(applyPendingDiaryActions(base, []).eaten.kcal).toBe(21);
});

it.each(['add', 'edit', 'delete'] as const)('incorpora el resultado confirmado de %s', (kind) => {
  const action: DiaryAction =
    kind === 'add'
      ? { kind, date: summary.date, meal: 'breakfast', food, grams: 150, temporaryId: 'temp' }
      : kind === 'edit'
        ? { kind, entry, changes: { grams: 50 } }
        : { kind, entry };
  const saved = { ...entry, id: kind === 'add' ? 'saved' : entry.id, grams: 50, kcal: 101 };
  const base = kind === 'add' ? summary : added;
  const before = structuredClone(base);
  const result = incorporateDiaryResult(base, action, kind === 'delete' ? undefined : saved);
  expect(result.meals[0]!.entries).toEqual(kind === 'delete' ? [] : [saved]);
  expect(result.eaten.kcal).toBe(kind === 'delete' ? 0 : 101);
  expect(base).toEqual(before);
  const pending: DiaryAction = {
    kind: 'add',
    date: summary.date,
    meal: 'lunch',
    food,
    grams: 100,
    temporaryId: 'pending',
  };
  expect(applyPendingDiaryActions(result, [pending]).eaten.kcal).toBe(
    kind === 'delete' ? 200 : 301,
  );
});
