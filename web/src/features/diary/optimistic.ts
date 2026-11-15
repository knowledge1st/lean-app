import {
  MEALS,
  roundMacros,
  sumMacros,
  macrosForGrams,
  type DaySummary,
  type Entry,
  type Food,
  type Meal,
} from '@lean/shared';
export type EntryChanges = Partial<Pick<Entry, 'grams' | 'meal' | 'status'>>;
export type DiaryAction =
  | { kind: 'add'; food: Food; grams: number; meal: Meal; date: string; temporaryId: string }
  | { kind: 'edit'; entry: Entry; changes: EntryChanges }
  | { kind: 'delete'; entry: Entry };
export function recalculateSummary(summary: DaySummary, entries: Entry[]): DaySummary {
  const total = (items: Entry[], status: Entry['status']) =>
    roundMacros(sumMacros(items.filter((entry) => entry.status === status)));
  return {
    ...summary,
    eaten: total(entries, 'eaten'),
    planned: total(entries, 'planned'),
    meals: MEALS.map((meal) => {
      const items = entries.filter((entry) => entry.meal === meal);
      return {
        meal,
        entries: items,
        eaten: total(items, 'eaten'),
        planned: total(items, 'planned'),
      };
    }),
  };
}
export function applyDiaryAction(summary: DaySummary, action: DiaryAction): DaySummary {
  let entries = summary.meals.flatMap((meal) => meal.entries);
  if (action.kind === 'add') {
    const { food, grams, meal, date, temporaryId } = action;
    entries = [
      ...entries,
      {
        id: temporaryId,
        date,
        meal,
        status: 'eaten',
        foodId: food.id!,
        grams,
        ...roundMacros(macrosForGrams(food, grams)),
        food: { ...food, id: food.id! },
        createdAt: new Date().toISOString(),
      },
    ];
  } else if (action.kind === 'delete')
    entries = entries.filter((entry) => entry.id !== action.entry.id);
  else
    entries = entries.map((entry) =>
      entry.id !== action.entry.id
        ? entry
        : {
            ...entry,
            ...action.changes,
            ...(action.changes.grams !== undefined
              ? roundMacros(macrosForGrams(entry, (action.changes.grams * 100) / entry.grams))
              : {}),
          },
    );
  return recalculateSummary(summary, entries);
}
