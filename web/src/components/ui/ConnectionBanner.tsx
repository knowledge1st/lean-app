import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../lib/api';
import { Button } from './Button';

export function ConnectionBanner() {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribe = cache.subscribe(listener);
      window.addEventListener('online', listener);
      window.addEventListener('offline', listener);
      return () => {
        unsubscribe();
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
      };
    },
    [cache],
  );
  const getSnapshot = useCallback(
    () =>
      navigator.onLine === false ||
      cache
        .getAll()
        .some(
          ({ state }) =>
            state.status === 'error' &&
            state.error instanceof ApiError &&
            (state.error.code === 'network_error' || state.error.code === 'timeout_error'),
        ),
    [cache],
  );
  const disconnected = useSyncExternalStore(subscribe, getSnapshot);
  if (!disconnected) return null;
  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <p>Sin conexión con el servidor.</p>
      <Button
        variant="secondary"
        onClick={() => {
          void client.refetchQueries({ predicate: (query) => query.state.status === 'error' });
        }}
      >
        Reintentar todo
      </Button>
    </div>
  );
}
