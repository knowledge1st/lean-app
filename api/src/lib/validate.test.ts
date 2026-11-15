import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { handleError } from './errors';
import { validate } from './validate';

const a = new Hono<AppEnv>()
  .post('/body', validate('json', z.object({ name: z.string().min(1) })), (c) =>
    c.json({ name: c.req.valid('json').name }),
  )
  .get('/query', validate('query', z.object({ n: z.coerce.number().int() })), (c) =>
    c.json({ n: c.req.valid('query').n }),
  );
a.onError(handleError);

const postJson = (body: string) =>
  a.request('/body', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

describe('validate', () => {
  it('passes parsed data to the handler', async () => {
    const res = await postJson(JSON.stringify({ name: 'Ana' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Ana' });
  });

  it('rejects an invalid body with validation_error', async () => {
    const res = await postJson(JSON.stringify({ name: '' }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('name');
  });

  it('coerces and validates query params', async () => {
    expect(await (await a.request('/query?n=3')).json()).toEqual({ n: 3 });
    const res = await a.request('/query?n=abc');
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('validation_error');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await postJson('{not json');
    expect(res.status).toBe(400);
  });
});
