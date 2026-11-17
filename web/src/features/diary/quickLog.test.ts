import { expect, it, vi } from 'vitest';
import type { Entry } from '@lean/shared';
import {
  QUICK_LOG_IDLE_MS,
  hasRecentEatenEntry,
  readQuickLogState,
  shouldShowQuickLog,
  suggestedMeal,
  writeQuickLogState,
} from './quickLog';

it.each([
  [0, 'dinner'],
  [4, 'dinner'],
  [5, 'breakfast'],
  [10, 'breakfast'],
  [11, 'lunch'],
  [15, 'lunch'],
  [16, 'afternoon_snack'],
  [19, 'afternoon_snack'],
  [20, 'dinner'],
  [23, 'dinner'],
] as const)('suggests the meal at %i', (hour, meal) => {
  expect(suggestedMeal(hour)).toBe(meal);
});
it('requires three hours on mount and on return', () => {
  const now = QUICK_LOG_IDLE_MS * 3;
  expect(shouldShowQuickLog({ lastShownAt: 0, lastHiddenAt: 0 }, now, 'mount')).toBe(true);
  expect(
    shouldShowQuickLog({ lastShownAt: now - QUICK_LOG_IDLE_MS + 1, lastHiddenAt: 0 }, now, 'mount'),
  ).toBe(false);
  expect(
    shouldShowQuickLog({ lastShownAt: now - QUICK_LOG_IDLE_MS, lastHiddenAt: 0 }, now, 'mount'),
  ).toBe(true);
  expect(shouldShowQuickLog({ lastShownAt: 0, lastHiddenAt: now - 1 }, now, 'mount')).toBe(true);
  expect(
    shouldShowQuickLog({ lastShownAt: 0, lastHiddenAt: now - QUICK_LOG_IDLE_MS }, now, 'visible'),
  ).toBe(true);
  expect(
    shouldShowQuickLog(
      { lastShownAt: 0, lastHiddenAt: now - QUICK_LOG_IDLE_MS + 1 },
      now,
      'visible',
    ),
  ).toBe(false);
  expect(shouldShowQuickLog({ lastShownAt: 0, lastHiddenAt: 0 }, now, 'visible')).toBe(false);
});
it('handles missing, corrupt and unavailable storage', () => {
  expect(readQuickLogState({ getItem: () => null })).toEqual({ lastShownAt: 0, lastHiddenAt: 0 });
  for (const raw of ['{', '{}', 'null', '{"lastShownAt":-1,"lastHiddenAt":0}'])
    expect(readQuickLogState({ getItem: () => raw })).toBeNull();
  expect(
    readQuickLogState({
      getItem: () => {
        throw new Error('blocked');
      },
    }),
  ).toBeNull();
  expect(
    writeQuickLogState(
      {
        setItem: () => {
          throw new Error('blocked');
        },
      },
      { lastShownAt: 1, lastHiddenAt: 0 },
    ),
  ).toBe(false);
  const setItem = vi.fn();
  expect(writeQuickLogState({ setItem }, { lastShownAt: 1, lastHiddenAt: 0 })).toBe(true);
  expect(readQuickLogState({ getItem: () => setItem.mock.calls[0]![1] })).toEqual({
    lastShownAt: 1,
    lastHiddenAt: 0,
  });
});
it('suppresses recent eaten entries regardless of their diary date', () => {
  const now = Date.parse('2026-11-17T15:00:00Z');
  const entry = { date: '2026-11-17', status: 'eaten', createdAt: '2026-11-17T14:30:00Z' } as Entry;
  expect(hasRecentEatenEntry([entry], now)).toBe(true);
  expect(hasRecentEatenEntry([{ ...entry, status: 'planned' }], now)).toBe(false);
  expect(hasRecentEatenEntry([{ ...entry, date: '2026-11-16' }], now)).toBe(true);
  expect(hasRecentEatenEntry([entry], now + 60 * 60 * 1000)).toBe(false);
});
