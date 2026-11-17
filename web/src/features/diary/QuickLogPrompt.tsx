import { useCallback, useEffect, useRef, useState } from 'react';
import { MEALS, type DaySummary, type Meal } from '@lean/shared';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { todayLocal } from '../../lib/date';
import { MEAL_LABELS } from '../../lib/macros';
import { useDaySummary } from './api';
import {
  hasRecentEatenEntry,
  readQuickLogState,
  shouldShowQuickLog,
  suggestedMeal,
  writeQuickLogState,
} from './quickLog';

export function QuickLogPrompt({
  ready,
  summary,
  onChoose,
}: {
  ready: boolean;
  summary: DaySummary | undefined;
  onChoose: (meal: Meal) => void;
}) {
  const [candidate, setCandidate] = useState(false);
  const mounted = useRef(false);
  const resume = useRef(false);
  const storageFailed = useRef(false);
  const close = useCallback(() => {
    setCandidate(false);
    try {
      if (!writeQuickLogState(localStorage, { lastShownAt: Date.now(), lastHiddenAt: 0 }))
        storageFailed.current = true;
    } catch {
      storageFailed.current = true;
    }
  }, []);
  useEffect(() => {
    function evaluate(reason: 'mount' | 'visible') {
      if (storageFailed.current) return;
      try {
        const state = readQuickLogState(localStorage);
        if (!state) {
          storageFailed.current = true;
          return;
        }
        const now = Date.now();
        const eligible = shouldShowQuickLog(state, now, reason);
        if (!writeQuickLogState(localStorage, { lastShownAt: now, lastHiddenAt: 0 })) {
          storageFailed.current = true;
          return;
        }
        setCandidate(eligible);
      } catch {
        storageFailed.current = true;
      }
    }
    if (ready && document.visibilityState !== 'hidden' && (!mounted.current || resume.current)) {
      evaluate(resume.current ? 'visible' : 'mount');
      mounted.current = true;
      resume.current = false;
    }
    function visibilityChanged() {
      if (document.visibilityState === 'hidden') {
        setCandidate(false);
        try {
          const state = readQuickLogState(localStorage);
          if (!state || !writeQuickLogState(localStorage, { ...state, lastHiddenAt: Date.now() }))
            storageFailed.current = true;
        } catch {
          storageFailed.current = true;
        }
      } else if (ready) {
        evaluate('visible');
        mounted.current = true;
      } else resume.current = true;
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, [ready]);
  if (!candidate || !ready || !summary) return null;
  return summary.date === todayLocal() ? (
    <QuickLogSheet summary={summary} onChoose={onChoose} onClose={close} />
  ) : (
    <QuickLogTodaySheet onChoose={onChoose} onClose={close} />
  );
}
function QuickLogTodaySheet({
  onChoose,
  onClose,
}: {
  onChoose: (meal: Meal) => void;
  onClose: () => void;
}) {
  const query = useDaySummary(todayLocal());
  return query.isSuccess && !query.isFetching ? (
    <QuickLogSheet summary={query.data} onChoose={onChoose} onClose={onClose} />
  ) : null;
}
function QuickLogSheet({
  summary,
  onChoose,
  onClose,
}: {
  summary: DaySummary;
  onChoose: (meal: Meal) => void;
  onClose: () => void;
}) {
  const suggested = suggestedMeal(new Date().getHours());
  const meals = [suggested, ...MEALS.filter((meal) => meal !== suggested)];
  const recent = hasRecentEatenEntry(
    summary.meals.flatMap((meal) => meal.entries),
    todayLocal(),
    Date.now(),
  );
  useEffect(() => {
    if (recent) onClose();
  }, [recent, onClose]);
  return (
    <Sheet
      open={!recent}
      title="¿Querés cargar alguna comida?"
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {meals.map((meal) => (
          <Button
            key={meal}
            variant={meal === suggested ? 'primary' : 'secondary'}
            onClick={() => {
              onClose();
              onChoose(meal);
            }}
          >
            {MEAL_LABELS[meal]}
          </Button>
        ))}
      </div>
      <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
        Ahora no
      </Button>
    </Sheet>
  );
}
