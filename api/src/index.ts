import { Hono } from 'hono';
import type { AppEnv } from './env';
import { handleError, handleNotFound } from './lib/errors';
import { cors } from './middleware/cors';
import { requireAuth } from './middleware/requireAuth';
import { bodyLimit, securityHeaders } from './middleware/security';
import { textLog } from './routes/textLog';
import { auth, me } from './routes/auth';
import { shopping } from './routes/shopping';
import { entries } from './routes/entries';
import { summary } from './routes/summary';
import { foods } from './routes/foods';
import { health } from './routes/health';
import { profile } from './routes/profile';
import { goals, targets } from './routes/goals';
import { checkins } from './routes/checkins';

import { bodyLogs } from './routes/bodyLogs';
import { water } from './routes/water';
import { exercise } from './routes/exercise';
import { push } from './routes/push';
import { reminders } from './routes/reminders';
import { getDb } from './db/client';
import { runReminders } from './lib/reminders';
import type { Env } from './env';

export const app = new Hono<AppEnv>();

app.use('*', securityHeaders());
app.use('*', cors());
app.use('/api/*', bodyLimit());
app.use('/api/*', (c, next) => {
  const path = c.req.path;
  if (
    c.req.method === 'OPTIONS' ||
    path === '/api/health' ||
    path.startsWith('/api/health/') ||
    (c.req.method === 'POST' && path === '/api/auth/login')
  )
    return next();
  return requireAuth(c, next);
});
app.route('/api/health', health);
app.route('/api/auth', auth);
app.route('/api/me', me);
app.route('/api/text-log', textLog);
app.route('/api/foods', foods);
app.route('/api/entries', entries);
app.route('/api/shopping', shopping);
app.route('/api/summary', summary);
app.route('/api/profile', profile);
app.route('/api/goals', goals);
app.route('/api/checkins', checkins);
app.route('/api/targets', targets);
app.route('/api/body-logs', bodyLogs);
app.route('/api/water', water);
app.route('/api/exercise', exercise);
app.route('/api/push', push);
app.route('/api/reminders', reminders);

app.notFound(handleNotFound);
app.onError(handleError);

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runReminders(env, getDb(env), new Date(controller.scheduledTime)).then(
        (result) => {
          if (result.checkedDatabase) console.log('reminders', JSON.stringify(result));
        },
        (error: unknown) => console.error('reminders failed', error),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
