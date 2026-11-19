import { textLogStatusSchema } from '@lean/shared';
import { Hono } from 'hono';
import { getDb } from '../db/client';
import type { AppEnv } from '../env';
import { getFreeModels } from '../lib/textLog/freeModels';
import { degradedModels } from '../lib/textLog/health';

export const textLog = new Hono<AppEnv>();
textLog.get('/status', async (c) => {
  const db = getDb(c.env);
  const state = await getFreeModels({ db, env: c.env });
  const degraded = await degradedModels(db, new Date());
  const candidates = state.candidates;
  return c.json(
    textLogStatusSchema.parse({
      available: Boolean(
        c.env.OPENROUTER_API_KEY && candidates.length && state.freeRemaining !== 0,
      ),
      photo: {
        available: Boolean(
          c.env.OPENROUTER_API_KEY && state.photoCandidates.length && state.freeRemaining !== 0,
        ),
        candidates: state.photoCandidates,
        degraded: await degradedModels(db, new Date(), 'photo'),
      },
      candidates,
      degraded,
      checkedAt: state.checkedAt?.toISOString() ?? null,
      freeRemainingToday: state.freeRemaining,
    }),
  );
});
