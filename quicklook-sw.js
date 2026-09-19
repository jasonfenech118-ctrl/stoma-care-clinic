/* Minimal service worker — installability only, never caching.

   Chrome will not fire its native "Install app" prompt (beforeinstallprompt)
   unless the site registers a service worker that has a fetch handler. This
   worker exists purely to satisfy that requirement so tapping "Add to phone"
   can install Quick Look automatically instead of falling back to manual steps.

   It caches NOTHING and serves every request straight from the network, so it
   can never keep a stale or broken page on screen — the problem the old
   kill-switch worker was added to prevent. On activation it also clears any
   caches an older worker may have left behind. */
self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    try { await self.clients.claim(); } catch (err) {}
  })());
});

// A fetch handler is required for installability. This one is pure pass-through
// for same-origin GETs (network-only, no cache reads or writes); everything else
// — other methods and cross-origin calls such as Supabase — is left untouched.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  try { if (new URL(req.url).origin !== self.location.origin) return; } catch (e) { return; }
  event.respondWith(fetch(req));
});
