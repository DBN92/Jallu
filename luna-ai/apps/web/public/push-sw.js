/* Avisos no celular (Web Push). Carregado pelo service worker do app instalado. */
self.addEventListener('push', (event) => {
  let msg = { title: 'Luna', body: '', url: '/', tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {
    if (event.data) msg.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: msg.url },
      renotify: !!msg.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins.find((w) => new URL(w.url).origin === url.origin);
      if (win) {
        // App já aberto: avisa a tela para abrir o recado e traz para a frente
        win.postMessage({ type: 'luna-open', url: url.pathname + url.search });
        return win.focus();
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
