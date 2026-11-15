import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  userSchema,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_BYTES,
} from './auth';

describe('auth schemas', () => {
  it('normalizes username without changing password', () => {
    expect(loginRequestSchema.parse({ username: '  ALICE  ', password: ' a ' })).toEqual({
      username: 'alice',
      password: ' a ',
    });
  });
  it('checks username and login password boundaries', () => {
    for (const username of ['', '   ', 'a'.repeat(65)]) {
      expect(loginRequestSchema.safeParse({ username, password: 'x' }).success).toBe(false);
    }
    for (const password of ['', 'a'.repeat(201)]) {
      expect(loginRequestSchema.safeParse({ username: 'a', password }).success).toBe(false);
    }
    expect(
      loginRequestSchema.safeParse({ username: 'a'.repeat(64), password: 'x'.repeat(200) }).success,
    ).toBe(true);
  });
  it('requires at least 10 characters and at most 72 UTF-8 bytes for a new password', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_BYTES).toBe(72);
    for (const newPassword of ['', 'a'.repeat(9), 'a'.repeat(73), 'ñ'.repeat(37)]) {
      expect(
        changePasswordRequestSchema.safeParse({
          currentPassword: 'x',
          newPassword,
        }).success,
      ).toBe(false);
    }
    for (const length of [10, 72]) {
      expect(
        changePasswordRequestSchema.safeParse({
          currentPassword: 'x',
          newPassword: 'a'.repeat(length),
        }).success,
      ).toBe(true);
    }
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: '', newPassword: 'a'.repeat(10) })
        .success,
    ).toBe(false);
  });
  it('validates the public user and login response', () => {
    const user = {
      id: '00000000-0000-4000-8000-000000000001',
      username: 'alice',
      displayName: 'Alice',
    };
    expect(userSchema.parse(user)).toEqual(user);
    expect(userSchema.safeParse({ ...user, id: 'bad' }).success).toBe(false);
    expect(loginResponseSchema.parse({ token: 'token', user })).toEqual({ token: 'token', user });
    expect(loginResponseSchema.safeParse({ token: '', user }).success).toBe(false);
  });
});
