/* Service worker for the MDH Directory home-screen app only.
   Registered with scope "directory.html", so it never controls the clinic app.
   Network-first: always try the live file, fall back to the cached copy offline. */
var CACHE = 'medilink-v2';
var ASSETS = [
  'directory.html',
  'assets/directory.csv',
  'directory.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS).catch(function () {}); // a missing asset must not fail install
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (m) { return m || caches.match('directory.html'); });
    })
  );
});
