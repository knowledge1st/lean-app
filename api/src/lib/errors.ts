import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ErrorBody {
  error: { code: string; message: string };
}

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const codeForStatus: Partial<Record<number, string>> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'too_many_requests',
};

export const errorResponse = (
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
): Response => c.json<ErrorBody>({ error: { code, message } }, status);

export const handleError = (err: Error, c: Context): Response => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message }, ...err.extra }, err.status);
  }
  if (err instanceof HTTPException && err.status < 500) {
    const status = err.status as ContentfulStatusCode;
    return errorResponse(c, status, codeForStatus[status] ?? 'error', err.message);
  }
  // Database errors can embed passwords and token hashes in query parameters.
  console.error('Unhandled API error');
  return errorResponse(c, 500, 'internal_error', 'Internal server error');
};

export const handleNotFound = (c: Context): Response =>
  errorResponse(c, 404, 'not_found', 'Route not found');
