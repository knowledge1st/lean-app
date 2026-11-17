import type { TextLogDeps } from './freeModels';

// Keep maintenance alive in Workers without delaying the response. Local callers
// without an execution context still await it. Never log task errors or payloads.
export async function completeTask(
  deps: Pick<TextLogDeps, 'waitUntil'>,
  task: PromiseLike<unknown>,
): Promise<void> {
  const pending = Promise.resolve(task).then(
    () => {},
    () => {},
  );
  if (deps.waitUntil) deps.waitUntil(pending);
  else await pending;
}
