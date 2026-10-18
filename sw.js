// Service worker: nätverket först, cachen bara när man är offline. Då når en ny version alltid fram
// direkt (tidigare cache-först visade gamla filer – även version.js – så uppdateringen märktes aldrig).
// Sparade hjul ligger i localStorage och påverkas inte av cachen.
const CACHE = 'arshjul-app';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'css/app.css',
  'js/app.js', 'js/example.js', 'js/i18n.js', 'js/model.js', 'js/store.js', 'js/version.js', 'js/wheel.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
    .catch(() => {}) // offlinekopian är en bonus – en fil som saknas får inte stoppa uppdateringen
    .then(() => self.skipWaiting()));
});

// Rensa cachar från äldre versioner (arshjul-0.x.y).
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('arshjul-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error())));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' })
    .then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
