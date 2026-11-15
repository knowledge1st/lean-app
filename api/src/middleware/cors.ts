import { cors as honoCors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';

/** Allows only `ALLOWED_ORIGIN`; other origins get no CORS headers. */
export const cors = () =>
  createMiddleware<AppEnv>((c, next) =>
    honoCors({
      origin: (origin) => (origin === c.env.ALLOWED_ORIGIN ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 86400,
    })(c, next),
  );
