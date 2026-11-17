import { bodyLimit as honoBodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../env';
import { AppError } from '../lib/errors';

/** Largest accepted request body. Every legitimate body is a few hundred bytes. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Rejects bodies above `MAX_BODY_BYTES` with 413 `payload_too_large`, before parsing them. */
export const bodyLimit = () =>
  honoBodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: () => {
      throw new AppError(413, 'payload_too_large', 'El cuerpo del pedido es demasiado grande');
    },
  });

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
