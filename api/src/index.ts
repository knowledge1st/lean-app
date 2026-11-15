import { Hono } from 'hono';
import type { AppEnv } from './env';
import { handleError, handleNotFound } from './lib/errors';
import { cors } from './middleware/cors';
import { health } from './routes/health';

export const app = new Hono<AppEnv>();

app.use('*', cors());
app.route('/api/health', health);

app.notFound(handleNotFound);
app.onError(handleError);

export default app;
