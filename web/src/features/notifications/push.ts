import type { PushSubscriptionInput } from '@lean/shared';
import { api } from '../../lib/api';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

export function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
/** On iPhone, Web Push only exists once the app is added to the home screen. */
export function pushSupport(): PushSupport {
  const available =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (available) return 'supported';
  return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return Promise.resolve(undefined);
  return navigator.serviceWorker
    .register(SW_URL, { scope: import.meta.env.BASE_URL })
    .catch(() => undefined);
}
async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) ??
    (await navigator.serviceWorker.register(SW_URL, { scope: import.meta.env.BASE_URL }))
  );
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
export function toInput(subscription: PushSubscription): PushSubscriptionInput {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
  };
}

/** Must run from a tap: iOS only shows the permission prompt after a user gesture. */
export async function enablePush(): Promise<'granted' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/public-key');
  const reg = await registration();
  let subscription = await reg.pushManager.getSubscription();
  const expected = keyBytes(publicKey);
  const current = subscription?.options.applicationServerKey;
  if (subscription && current && new Uint8Array(current).join() !== expected.join()) {
    // The server key changed: an old subscription would be rejected by the push service.
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: expected,
  });
  await api.post('/api/push/subscriptions', toInput(subscription));
  return 'granted';
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.apiFetch('/api/push/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
}

/** Best effort on logout, so this device stops getting the previous user's reminders. */
export async function forgetDeviceOnLogout(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (subscription) {
      await api.apiFetch('/api/push/subscriptions', {
        method: 'DELETE',
        body: { endpoint: subscription.endpoint },
      });
      await subscription.unsubscribe();
    }
  } catch {
    // Logging out must not depend on the push service.
  }
}
