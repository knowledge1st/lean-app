import type { Env } from './env';

export const ALLOWED = 'http://localhost:5173';

export const testEnv: Env = {
  DATABASE_URL: 'postgres://test',
  ALLOWED_ORIGIN: ALLOWED,
};
