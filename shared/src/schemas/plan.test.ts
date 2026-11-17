import { describe, expect, it } from 'vitest';
import { copyEntriesSchema, markEatenSchema } from './plan';
describe('plan schemas', () => {
  it.each(['append', 'replace'])('accepts %s copies', (mode) => {
    expect(
      copyEntriesSchema.safeParse({ scope: 'day', from: '2026-12-28', to: '2027-01-04', mode })
        .success,
    ).toBe(true);
    expect(
      copyEntriesSchema.safeParse({ scope: 'week', from: '2026-W53', to: '2027-W01', mode })
        .success,
    ).toBe(true);
  });
  it.each([
    { scope: 'day', from: '2026-01-01', to: '2026-01-01', mode: 'append' },
    { scope: 'week', from: '2026-W53', to: '2026-W53', mode: 'replace' },
    { scope: 'week', from: '2021-W53', to: '2026-W53', mode: 'append' },
    { scope: 'day', from: '2026-02-30', to: '2026-03-01', mode: 'append' },
    { scope: 'day', from: '2026-01-01', to: '2026-01-02', mode: 'other' },
    { scope: 'other', from: '2026-01-01', to: '2026-01-02', mode: 'append' },
  ])('rejects %j', (input) => expect(copyEntriesSchema.safeParse(input).success).toBe(false));
  it('keeps the equal origin error', () => {
    const result = copyEntriesSchema.safeParse({
      scope: 'day',
      from: '2026-01-01',
      to: '2026-01-01',
      mode: 'append',
    });
    expect(result.error?.issues[0]?.message).toBe('El origen y el destino no pueden ser iguales');
  });
  it('validates mark eaten with optional meal', () => {
    expect(markEatenSchema.parse({ date: '2026-01-01' })).toEqual({ date: '2026-01-01' });
    expect(markEatenSchema.safeParse({ date: '2026-01-01', meal: 'dinner' }).success).toBe(true);
    expect(markEatenSchema.safeParse({ date: '2026-01-01', meal: 'other' }).success).toBe(false);
    expect(markEatenSchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
  });
});
