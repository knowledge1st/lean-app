import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  onTextLog,
  onPhotoLog,
}: {
  ready: boolean;
  summary: DaySummary | undefined;
  onChoose: (meal: Meal) => void;
  onTextLog?: (() => void) | undefined;
  onPhotoLog?: (() => void) | undefined;
}) {
  const [candidate, setCandidate] = useState(false);
  const mounted = useRef(false);
  const resume = useRef(false);
  const storageFailed = useRef(false);
  const dismiss = useCallback(() => setCandidate(false), []);
  const recordShown = useCallback(() => {
    try {
      if (!writeQuickLogState(localStorage, { lastShownAt: Date.now(), lastHiddenAt: 0 }))
        storageFailed.current = true;
    } catch {
      storageFailed.current = true;
    }
  }, []);
  const close = useCallback(() => {
    dismiss();
    recordShown();
  }, [dismiss, recordShown]);
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
        setCandidate(eligible);
      } catch {
        storageFailed.current = true;
      }
    }
    function attempt() {
      if (
        !ready ||
        document.visibilityState === 'hidden' ||
        (mounted.current && !resume.current) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      evaluate(resume.current ? 'visible' : 'mount');
      mounted.current = true;
      resume.current = false;
    }
    attempt();
    const observer = new MutationObserver(attempt);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role'],
    });
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
      } else {
        resume.current = true;
        attempt();
      }
    }
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [ready]);
  if (!candidate || !ready || !summary) return null;
  return summary.date === todayLocal() ? (
    <QuickLogSheet
      summary={summary}
      onTextLog={onTextLog}
      onPhotoLog={onPhotoLog}
      onChoose={onChoose}
      onClose={close}
      onShown={recordShown}
      onSuppress={dismiss}
    />
  ) : (
    <QuickLogTodaySheet
      onTextLog={onTextLog}
      onPhotoLog={onPhotoLog}
      onChoose={onChoose}
      onClose={close}
      onShown={recordShown}
      onSuppress={dismiss}
    />
  );
}
function QuickLogTodaySheet({
  onChoose,
  onTextLog,
  onPhotoLog,
  onClose,
  onShown,
  onSuppress,
}: {
  onChoose: (meal: Meal) => void;
  onTextLog?: (() => void) | undefined;
  onPhotoLog?: (() => void) | undefined;
  onClose: () => void;
  onShown: () => void;
  onSuppress: () => void;
}) {
  const query = useDaySummary(todayLocal());
  return query.isSuccess && !query.isFetching ? (
    <QuickLogSheet
      summary={query.data}
      onTextLog={onTextLog}
      onPhotoLog={onPhotoLog}
      onChoose={onChoose}
      onClose={onClose}
      onShown={onShown}
      onSuppress={onSuppress}
    />
  ) : null;
}
function QuickLogSheet({
  summary,
  onChoose,
  onTextLog,
  onPhotoLog,
  onClose,
  onShown,
  onSuppress,
}: {
  summary: DaySummary;
  onChoose: (meal: Meal) => void;
  onTextLog?: (() => void) | undefined;
  onPhotoLog?: (() => void) | undefined;
  onClose: () => void;
  onShown: () => void;
  onSuppress: () => void;
}) {
  const client = useQueryClient();
  const [blocked, setBlocked] = useState(() => Boolean(document.querySelector('[role="dialog"]')));
  useEffect(() => {
    if (!blocked) return;
    const observer = new MutationObserver(() => {
      if (!document.querySelector('[role="dialog"]')) setBlocked(false);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role'],
    });
    return () => observer.disconnect();
  }, [blocked]);
  const suggested = suggestedMeal(new Date().getHours());
  const meals = [suggested, ...MEALS.filter((meal) => meal !== suggested)];
  const recent = hasRecentEatenEntry(
    [
      summary,
      ...client.getQueriesData<DaySummary>({ queryKey: ['summary', 'day'] }).map(([, day]) => day),
    ].flatMap((day) => day?.meals.flatMap((meal) => meal.entries) ?? []),
    Date.now(),
  );
  useEffect(() => {
    if (recent) onSuppress();
    else if (!blocked) onShown();
  }, [recent, blocked, onSuppress, onShown]);
  return (
    <Sheet
      open={!recent && !blocked}
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
      {onTextLog && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => {
            onClose();
            onTextLog();
          }}
        >
          Escribir lo que comí
        </Button>
      )}
      {onPhotoLog && (
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => {
            onClose();
            onPhotoLog();
          }}
        >
          Sacar foto del plato
        </Button>
      )}
      <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
        Ahora no
      </Button>
    </Sheet>
  );
}
