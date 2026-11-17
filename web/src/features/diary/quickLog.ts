import type { Entry, Meal } from '@lean/shared';

export const QUICK_LOG_IDLE_MS = 3 * 60 * 60 * 1000;
export const QUICK_LOG_STORAGE_KEY = 'lean.quickLog.v1';
export type QuickLogState = { lastShownAt: number; lastHiddenAt: number };

export function suggestedMeal(hour: number): Meal {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 20) return 'afternoon_snack';
  return 'dinner';
}
export function readQuickLogState(storage: Pick<Storage, 'getItem'>): QuickLogState | null {
  try {
    const raw = storage.getItem(QUICK_LOG_STORAGE_KEY);
    if (raw === null) return { lastShownAt: 0, lastHiddenAt: 0 };
    const value: unknown = JSON.parse(raw);
    if (
      !value ||
      typeof value !== 'object' ||
      !('lastShownAt' in value) ||
      !('lastHiddenAt' in value)
    )
      return null;
    const { lastShownAt, lastHiddenAt } = value;
    if (
      typeof lastShownAt !== 'number' ||
      !Number.isFinite(lastShownAt) ||
      lastShownAt < 0 ||
      typeof lastHiddenAt !== 'number' ||
      !Number.isFinite(lastHiddenAt) ||
      lastHiddenAt < 0
    )
      return null;
    return { lastShownAt, lastHiddenAt };
  } catch {
    return null;
  }
}
export function writeQuickLogState(
  storage: Pick<Storage, 'setItem'>,
  state: QuickLogState,
): boolean {
  try {
    storage.setItem(QUICK_LOG_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function shouldShowQuickLog(
  state: QuickLogState,
  now: number,
  reason: 'mount' | 'visible',
): boolean {
  if (reason === 'visible')
    return state.lastHiddenAt > 0 && now - state.lastHiddenAt >= QUICK_LOG_IDLE_MS;
  const lastUsedAt = Math.max(state.lastShownAt, state.lastHiddenAt);
  return lastUsedAt === 0 || now - lastUsedAt >= QUICK_LOG_IDLE_MS;
}
export function hasRecentEatenEntry(entries: Entry[], today: string, now: number): boolean {
  return entries.some((entry) => {
    const createdAt = Date.parse(entry.createdAt);
    return (
      entry.date === today &&
      entry.status === 'eaten' &&
      createdAt <= now &&
      now - createdAt < 60 * 60 * 1000
    );
  });
}
