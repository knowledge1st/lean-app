import { expect, it } from 'vitest';
import * as shared from '../index';
import * as goals from './index';

it('reexports every public goal symbol without exposing internal date helpers', () => {
  for (const key of Object.keys(goals) as (keyof typeof goals)[]) {
    expect(shared[key]).toBe(goals[key]);
  }
  expect(goals).not.toHaveProperty('toDay');
  expect(goals).not.toHaveProperty('daysBetween');
  expect(goals).not.toHaveProperty('addDays');
  expect(shared).toHaveProperty('macrosForGrams');
  expect(shared).toHaveProperty('targetSchema');
});
