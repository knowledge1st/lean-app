import { describe, expect, it } from 'vitest';
import { resolveTargetsByDay } from './targets';

const dates = Array.from({ length: 7 }, (_, index) => `2026-11-${16 + index}`);
const row = (
  effectiveFrom: string,
  id = '00000000-0000-0000-0000-000000000001',
  createdAt = '2026-11-01T12:00:00Z',
) => ({ target: { effectiveFrom, id, createdAt: new Date(createdAt) }, goal: { id: 'goal' } });

describe('resolveTargetsByDay', () => {
  it('carries a target from before the week through every day', () => {
    const initial = row('2026-11-09');
    expect(resolveTargetsByDay([initial], dates)).toEqual(Array(7).fill(initial));
  });

  it('switches on Wednesday, ignores future targets and leaves rows unchanged', () => {
    const initial = row('2026-11-09');
    const changed = row('2026-11-18');
    const future = row('2026-11-23');
    const rows = [future, changed, initial];
    const before = structuredClone(rows);
    expect(resolveTargetsByDay(rows, dates)).toEqual([initial, initial, ...Array(5).fill(changed)]);
    expect(rows).toEqual(before);
  });

  it('preserves received priority when effectiveFrom and millisecond timestamps tie', () => {
    const first = row('2026-11-16', '00000000-0000-0000-0000-000000000001');
    const second = row('2026-11-16', '00000000-0000-0000-0000-000000000002');
    expect(resolveTargetsByDay([first, second], dates)).toEqual(Array(7).fill(first));
    expect(resolveTargetsByDay([second, first], dates)).toEqual(Array(7).fill(second));
  });

  it('does not reorder received rows by createdAt', () => {
    const first = row('2026-11-16');
    const newer = row('2026-11-16', '00000000-0000-0000-0000-000000000002', '2026-11-02T12:00:00Z');
    expect(resolveTargetsByDay([first, newer], dates)).toEqual(Array(7).fill(first));
  });

  it('returns null for every day without targets', () => {
    expect(resolveTargetsByDay([], dates)).toEqual(Array(7).fill(null));
  });

  it('returns null before the first target starts midweek', () => {
    const initial = row('2026-11-18');
    expect(resolveTargetsByDay([initial], dates)).toEqual([null, null, ...Array(5).fill(initial)]);
  });
});
