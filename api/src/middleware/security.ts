import { PHOTO_LOG_MAX_DATA_URL } from '@lean/shared';
import { bodyLimit as honoBodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';

/** Default maximum request body size. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Limits bodies before parsing, allowing larger photos only on the photo endpoint. */
export const bodyLimit = () => {
  const defaultLimit = honoBodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new AppError(413, 'payload_too_large', 'El cuerpo del pedido es demasiado grande');
    },
  });
  const photoLimit = honoBodyLimit({
    maxSize: PHOTO_LOG_MAX_DATA_URL + 2000,
    onError: () => {
      throw new AppError(413, 'photo_too_large', 'La foto es demasiado grande.');
    },
  });
  return createMiddleware<AppEnv>((c, next) =>
    c.req.method === 'POST' && c.req.path === '/api/entries/parse-photo'
      ? photoLimit(c, next)
      : defaultLimit(c, next),
  );
};

/**
 * API responses carry personal data: never cache them, never sniff them as another
 * type and never leak the API URL as a referrer. Applied to errors too.
 */
export const securityHeaders = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('Cache-Control', 'no-store');
  });
