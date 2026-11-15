import { validator } from 'hono/validator';
import type { z } from 'zod';
import { AppError } from './errors';

type Target = 'json' | 'query' | 'param';

const describeIssues = (error: z.ZodError): string =>
  error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');

/** Validates the request body, query or params with a zod schema; failures become 400 `validation_error`. */
export const validate = <T extends z.ZodType>(target: Target, schema: T) =>
  validator(target, (value): z.output<T> => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new AppError(400, 'validation_error', describeIssues(result.error));
    }
    return result.data;
  });
