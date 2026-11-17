import { expect, it } from 'vitest';
import { kcalStatus } from './api';
it.each([
  [950, 1000, 'on'],
  [1050, 1000, 'on'],
  [949, 1000, 'near'],
  [1051, 1000, 'near'],
  [850, 1000, 'near'],
  [1150, 1000, 'near'],
  [849, 1000, 'off'],
  [1151, 1000, 'off'],
  [0, 1000, 'off'],
  [0, null, null],
  [100, undefined, null],
  [100, 0, null],
  [100, -1, null],
] as const)('clasifica %s con meta %s como %s', (total, target, status) => {
  expect(kcalStatus(total, target)).toBe(status);
});
