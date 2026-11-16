import { expect, it } from 'vitest';
import { planSchema } from '@lean/shared';
import { warningText } from './warnings';
it('traduce todos los códigos del contrato', () => {
  for (const code of planSchema.shape.warnings.element.shape.code.options) {
    expect(warningText(code, { sex: 'female', today: '2026-11-16' }).trim().length).toBeGreaterThan(
      0,
    );
  }
});
it('incluye la fecha ajustada y aclara que ya se usa', () => {
  expect(
    warningText('rate_capped', {
      sex: 'male',
      today: '2026-01-01',
      adjusted: { targetDate: '2026-03-12' },
    }),
  ).toBe('Con un ritmo saludable llegás el 12 de marzo. El plan ya usa esa fecha.');
  expect(
    warningText('date_in_past', {
      sex: 'female',
      today: '2026-01-01',
      adjusted: { targetDate: '2027-03-12' },
    }),
  ).toContain('2027');
});
