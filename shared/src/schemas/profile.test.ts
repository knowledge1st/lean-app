import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_ZONE, profileInputSchema, profileSchema } from './profile';

const input = {
  sex: 'female',
  birthDate: '1990-02-28',
  heightCm: 165.5,
  activityLevel: 'moderate',
};
describe('profile schemas', () => {
  it('defaults the zone and accepts complete responses', () => {
    expect(profileInputSchema.parse(input)).toEqual({ ...input, timeZone: DEFAULT_TIME_ZONE });
    expect(profileSchema.safeParse({ ...input, timeZone: 'Europe/Madrid' }).success).toBe(true);
  });
  it.each([
    { heightCm: 99.9 },
    { heightCm: 250.1 },
    { heightCm: 170.01 },
    { heightCm: '170' },
    { heightCm: Infinity },
    { sex: 'other' },
    { activityLevel: 'extreme' },
    { birthDate: '2001-02-29' },
    { timeZone: 'Mars/City' },
    { timeZone: '' },
    { extra: true },
  ])('rejects invalid fields %j', (patch) => {
    expect(profileInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it.each([100, 250, 180.1])('accepts height %s', (heightCm) => {
    expect(profileInputSchema.safeParse({ ...input, heightCm }).success).toBe(true);
  });
  it('leaves today-dependent birth date validation to the API', () => {
    expect(profileInputSchema.safeParse({ ...input, birthDate: '2099-01-01' }).success).toBe(true);
  });
});
