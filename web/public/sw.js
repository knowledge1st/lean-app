/* global self, URL */
// Service worker de Lean: muestra los recordatorios push y abre la app al tocarlos.
// No intercepta pedidos (sin modo offline todavía; ver to-do.md).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function sameScope(url) {
  try {
    const target = new URL(url, self.registration.scope);
    return target.href.startsWith(self.registration.scope) ? target.href : self.registration.scope;
  } catch {
    return self.registration.scope;
  }
}

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Lean', {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: sameScope(data.url || self.registration.scope) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = sameScope(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
