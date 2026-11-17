import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import { currentSubscription, disablePush, enablePush, pushSupport, toInput } from './push';
import { api } from '../../lib/api';

export type DeviceState =
  'loading' | 'needs-install' | 'unsupported' | 'denied' | 'off' | 'on' | 'unavailable';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'push_unavailable')
    return 'Las notificaciones no están disponibles por ahora.';
  if (error instanceof ApiError) return error.message;
  return 'No se pudieron activar las notificaciones en este dispositivo.';
}

export function usePushDevice() {
  const [state, setState] = useState<DeviceState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const support = pushSupport();
      if (support !== 'supported') {
        if (!cancelled) setState(support);
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setState('denied');
        return;
      }
      const subscription = await currentSubscription().catch(() => null);
      if (subscription && Notification.permission === 'granted') {
        // Re-link the device: another user may have signed in on this browser before.
        await api.post('/api/push/subscriptions', toInput(subscription)).catch(() => undefined);
      }
      if (!cancelled) setState(subscription ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      setState((await enablePush()) === 'granted' ? 'on' : 'denied');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'push_unavailable')
        setState('unavailable');
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }, []);
  const disable = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      await disablePush();
      setState('off');
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }, []);
  return { state, busy, error, enable, disable };
}
