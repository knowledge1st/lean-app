import { expect, it } from 'vitest';
import { formatQuantity, validateItem } from './api';
it.each([
  [850, '850 g'],
  [850.5, '850,5 g'],
  [1000, '1 kg'],
  [1500, '1,5 kg'],
  [1250, '1,25 kg'],
  [null, ''],
])('formatea %s', (grams, expected) =>
  expect(formatQuantity(grams as number | null)).toBe(expected),
);
it.each(['0', '-2', '100001', '1.22', 'NaN', '1e3'])('rechaza cantidad %s', (quantity) =>
  expect(validateItem('Pan', quantity)).toBeTruthy(),
);
it('valida nombre y cantidad opcional', () => {
  expect(validateItem('   ', '')).toBeTruthy();
  expect(validateItem('a'.repeat(121), '')).toBeTruthy();
  expect(validateItem(' Pan ', '')).toBeNull();
  expect(validateItem('Pan', '100000')).toBeNull();
  expect(validateItem('Pan', '1,5')).toBeNull();
});
