// Pinturas Liz · notificaciones con la app cerrada (Web Push, 0.31.0). Lo carga el service worker de la app (importScripts).
// · push: muestra la notificación. Si la app está a la vista, no la repite: la app ya suena y avisa por su cuenta.
// · notificationclick: abre la app (o la trae al frente) directo en la orden.
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { titulo: event.data ? event.data.text() : 'Pinturas Liz' }; }
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (ventanas.some(v => v.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.titulo || 'Pinturas Liz', {
      body: d.cuerpo || '', tag: d.tag || undefined, renotify: !!d.tag, icon: 'icon-192.png', badge: 'icon-192.png',
      data: { orden: d.orden || null, modulo: d.modulo || null }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { orden, modulo } = event.notification.data || {};
  const url = new URL(self.registration.scope);
  if (orden) { url.searchParams.set('orden', orden); if (modulo) url.searchParams.set('m', modulo); }
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const v = ventanas[0];
    if (v) { await v.focus(); if (orden) v.postMessage({ tipo: 'abrir-orden', orden, modulo }); return; }
    await self.clients.openWindow(url.href);
  })());
});
