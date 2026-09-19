/* Kill-switch service worker.
   An earlier version registered a caching worker for the MediLink page. This
   replacement takes over, deletes every cache, unregisters itself, and reloads
   any open page — so no stale worker can keep an old or broken page on screen.
   It has NO fetch handler, so it never intercepts a request. */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
    try {
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) { if (c.navigate) { try { c.navigate(c.url); } catch (err) {} } });
    } catch (err) {}
  })());
});
