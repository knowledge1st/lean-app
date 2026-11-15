import { Hono } from 'hono';
import type { AppEnv } from './env';
import { handleError, handleNotFound } from './lib/errors';
import { cors } from './middleware/cors';
import { requireAuth } from './middleware/requireAuth';
import { auth, me } from './routes/auth';
import { foods } from './routes/foods';
import { health } from './routes/health';

export const app = new Hono<AppEnv>();

app.use('*', cors());
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
app.route('/api/foods', foods);

app.notFound(handleNotFound);
app.onError(handleError);

export default app;
