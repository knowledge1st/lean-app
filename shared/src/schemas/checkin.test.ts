import { describe, expect, it } from 'vitest';
import {
  checkinSchema,
  checkinStatusSchema,
  checkinReasonSchema,
  checkinsQuerySchema,
  checkinsResponseSchema,
  pendingCheckinResponseSchema,
  resolveCheckinSchema,
} from './checkin';

const current = { kcal: 2000, proteinG: 150, carbsG: 215, fatG: 60 };
const checkin = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  goalId: '123e4567-e89b-42d3-a456-426614174001',
  weekStart: '2026-11-02',
  weekEnd: '2026-11-08',
  status: 'insufficient_data',
  loggedDays: 8,
  weighIns: 3,
  avgIntakeKcal: null,
  estimatedTdee: null,
  trendWeightKg: null,
  actualWeeklyChangeKg: null,
  expectedWeeklyChangeKg: null,
  current,
  proposed: null,
  deltaKcal: null,
  reason: null,
  accepted: null,
  resolvedAt: null,
  createdAt: '2026-11-09T00:00:00Z',
};

describe('checkin schemas', () => {
  it('accepts persisted nullable results and response wrappers', () => {
    expect(checkinSchema.parse(checkin)).toEqual(checkin);
    expect(pendingCheckinResponseSchema.parse({ checkin: null })).toEqual({ checkin: null });
    expect(pendingCheckinResponseSchema.safeParse({ checkin }).success).toBe(true);
    expect(checkinsResponseSchema.parse({ checkins: [checkin] })).toEqual({ checkins: [checkin] });
    expect(
      checkinSchema.safeParse({
        ...checkin,
        status: 'adjust',
        avgIntakeKcal: 2000,
        estimatedTdee: 2275,
        trendWeightKg: 99.5,
        actualWeeklyChangeKg: -0.25,
        expectedWeeklyChangeKg: -0.5,
        proposed: { ...current, kcal: 1850 },
        deltaKcal: -150,
        reason: 'slower_than_plan',
        accepted: false,
        resolvedAt: '2026-11-09T01:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('validates enum values, UUIDs, calendar dates and integer fields', () => {
    for (const status of ['insufficient_data', 'on_track', 'adjust'])
      expect(checkinStatusSchema.safeParse(status).success).toBe(true);
    for (const reason of ['slower_than_plan', 'faster_than_plan'])
      expect(checkinReasonSchema.safeParse(reason).success).toBe(true);
    expect(checkinReasonSchema.safeParse('unknown').success).toBe(false);
    for (const patch of [
      { id: 'invalid' },
      { goalId: 'invalid' },
      { status: 'unknown' },
      { weekStart: '2026-02-30' },
      { weekEnd: 'invalid' },
      { loggedDays: 1.5 },
      { weighIns: 1.5 },
      { avgIntakeKcal: 2000.5 },
      { estimatedTdee: 2000.5 },
      { deltaKcal: 1.5 },
      { current: { ...current, kcal: 2000.5 } },
      { accepted: 'true' },
    ])
      expect(checkinSchema.safeParse({ ...checkin, ...patch }).success).toBe(false);
  });

  it('requires an explicit boolean resolution and rejects extra keys', () => {
    for (const accept of [true, false])
      expect(resolveCheckinSchema.parse({ accept })).toEqual({ accept });
    for (const value of [{}, { accept: 'true' }, { accept: true, goalId: checkin.goalId }])
      expect(resolveCheckinSchema.safeParse(value).success).toBe(false);
  });

  it('defaults and coerces the bounded integer query limit', () => {
    expect(checkinsQuerySchema.parse({})).toEqual({ limit: 10 });
    expect(checkinsQuerySchema.parse({ limit: '1' })).toEqual({ limit: 1 });
    expect(checkinsQuerySchema.parse({ limit: '52' })).toEqual({ limit: 52 });
    for (const limit of [0, 53, 1.5, 'invalid', null])
      expect(checkinsQuerySchema.safeParse({ limit }).success).toBe(false);
  });
});
