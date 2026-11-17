import { profileSchema } from '@lean/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTestDatabase } from '../../test/helpers/db';
import { completeProfile, goalsFixture } from '../../test/helpers/goals';
import { profiles } from '../db/schema';
import { app } from '../index';
import { testEnv } from '../test-env';

describe.skipIf(!hasTestDatabase)('profile integration', { timeout: 30_000 }, () => {
  let f: ReturnType<typeof goalsFixture>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T01:00:00Z'));
    f = goalsFixture();
    await f.setup();
  }, 30_000);
  afterEach(async () => {
    vi.useRealTimers();
    await f.cleanup();
  }, 30_000);
  it('upserts, converts numeric fields and isolates profiles', async () => {
    expect((await f.request('/profile')).status).toBe(404);
    await f.profile();
    const response = await f.request('/profile');
    expect(profileSchema.parse(await response.json())).toEqual(completeProfile);
    const updated = await f.request('/profile', 'PUT', {
      ...completeProfile,
      heightCm: 175.5,
      timeZone: undefined,
    });
    expect(updated.status).toBe(200);
    expect(profileSchema.parse(await updated.json()).heightCm).toBe(175.5);
    expect(
      await f.db.select().from(profiles).where(eq(profiles.userId, f.accounts[0]!.user.id)),
    ).toHaveLength(1);
    const other = await f.request('/profile', 'GET', undefined, 1);
    expect(other.status).toBe(404);
    expect(await other.json()).toMatchObject({ error: { code: 'profile_not_found' } });
    const otherPut = await f.request('/profile', 'PUT', { ...completeProfile, heightCm: 160 }, 1);
    expect(otherPut.status).toBe(200);
    expect(profileSchema.parse(await (await f.request('/profile')).json()).heightCm).toBe(175.5);
  });
  it('treats incomplete rows as missing', async () => {
    await f.db.insert(profiles).values({ userId: f.accounts[0]!.user.id, sex: 'male' });
    expect((await f.request('/profile')).status).toBe(404);
  });
  it.each([
    { heightCm: 99 },
    { heightCm: 170.01 },
    { timeZone: 'bad/zone' },
    { birthDate: '2026-11-17' },
    { birthDate: '2026-11-15' },
    { extra: true },
  ])('rejects invalid profile %j', async (patch) => {
    const response = await f.request('/profile', 'PUT', { ...completeProfile, ...patch });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
  });
  it('uses the submitted timezone for the birth date cutoff', async () => {
    // At 01:00 UTC it is still November 15 in Buenos Aires, and November 16 in Tokyo.
    const response = await f.request('/profile', 'PUT', {
      ...completeProfile,
      birthDate: '2026-11-15',
      timeZone: 'Asia/Tokyo',
    });
    expect(response.status).toBe(200);
  });
});
describe('profile authentication', () => {
  it.each(['GET', 'PUT'])('requires authentication for %s', async (method) => {
    expect((await app.request('/api/profile', { method }, testEnv)).status).toBe(401);
  });
});
