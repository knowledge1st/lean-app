const scriptCodes = new Set([
  'invalid_arguments',
  'missing_configuration',
  'missing_database',
  'database_unavailable',
  'catalog_unavailable',
  'model_must_be_live_and_free',
  'no_eligible_free_models',
  'missing_testing_user',
]);

// Error names are also untrusted provider data. Only emit known class names.
const errorNames = new Set([
  'Error',
  'TypeError',
  'SyntaxError',
  'RangeError',
  'ReferenceError',
  'URIError',
  'AggregateError',
  'AbortError',
  'TimeoutError',
  'AppError',
  'ZodError',
  'NeonDbError',
  'DrizzleQueryError',
]);

export function safeScriptError(error: unknown, fallback: 'evaluation_failed' | 'models_failed') {
  const name = error instanceof Error && errorNames.has(error.name) ? error.name : 'Error';
  const code = error instanceof Error && scriptCodes.has(error.message) ? error.message : undefined;
  // Never attach the original error, cause, stack, query or provider response.
  return new Error(JSON.stringify({ error: fallback, name, ...(code ? { code } : {}) }));
}
