import { useState } from 'react';
import { MEALS, ZERO_MACROS, type DaySummary, type Entry, type Meal } from '@lean/shared';
import { todayLocal } from '../../lib/date';
import { MealSection } from '../diary/MealSection';
import { EntrySheet } from '../diary/EntrySheet';
import { AddFoodSheet } from '../foods/AddFoodSheet';
import { useDiaryMutation } from '../diary/api';
import type { DiaryAction } from '../diary/optimistic';
export function DayPlan({ summary }: { summary: DaySummary }) {
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const mutation = useDiaryMutation();
  function mutate(action: DiaryAction) {
    mutation.mutate(action);
    setAdding(null);
    setEditing(null);
  }
  return (
    <>
      {MEALS.map((meal) => (
        <MealSection
          key={meal}
          meal={
            summary.meals.find((item) => item.meal === meal) ?? {
              meal,
              eaten: ZERO_MACROS,
              planned: ZERO_MACROS,
              entries: [],
            }
          }
          missed={summary.date < todayLocal()}
          onAdd={() => setAdding(meal)}
          onEdit={setEditing}
          onEat={(entry) => mutate({ kind: 'edit', entry, changes: { status: 'eaten' } })}
        />
      ))}
      {adding && (
        <AddFoodSheet
          date={summary.date}
          meal={adding}
          onClose={() => setAdding(null)}
          onAdd={(food, grams) =>
            mutate({
              kind: 'add',
              date: summary.date,
              meal: adding,
              food,
              grams,
              status: 'planned',
              temporaryId: `temp-${crypto.randomUUID()}`,
            })
          }
        />
      )}
      {editing && (
        <EntrySheet
          entry={editing}
          onClose={() => setEditing(null)}
          onSave={(changes) => mutate({ kind: 'edit', entry: editing, changes })}
          onDelete={() => mutate({ kind: 'delete', entry: editing })}
        />
      )}
    </>
  );
}
