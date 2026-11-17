import { test } from 'vitest';
import { safeScriptError } from './text-log-diagnostics';
import type { Env } from '../src/env';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('missing_database');
  const env: Env = {
    DATABASE_URL: process.env.DATABASE_URL,
    ALLOWED_ORIGIN: '',
    ...(process.env.OPENROUTER_API_KEY
      ? { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }
      : {}),
    ...(process.env.TEXT_LOG_PREFERRED_MODELS !== undefined
      ? { TEXT_LOG_PREFERRED_MODELS: process.env.TEXT_LOG_PREFERRED_MODELS }
      : {}),
    ...(process.env.TEXT_LOG_MODEL_DENYLIST !== undefined
      ? { TEXT_LOG_MODEL_DENYLIST: process.env.TEXT_LOG_MODEL_DENYLIST }
      : {}),
    ...(process.env.TEXT_LOG_MAX_CANDIDATES !== undefined
      ? { TEXT_LOG_MAX_CANDIDATES: process.env.TEXT_LOG_MAX_CANDIDATES }
      : {}),
  };
  const { getDb } = await import('../src/db/client');
  const { getFreeModels } = await import('../src/lib/textLog/freeModels');
  const state = await getFreeModels({ db: getDb(env), env }).catch(() => {
    throw new Error('database_unavailable');
  });
  console.log(
    JSON.stringify(
      {
        candidates: state.candidates,
        freeRemainingToday: state.freeRemaining,
        checkedAt: state.checkedAt,
      },
      null,
      2,
    ),
  );
}
test('text-log-models', async () => {
  try {
    await main();
  } catch (error) {
    throw safeScriptError(error, 'models_failed');
  }
});
