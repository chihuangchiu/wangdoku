/* WangDoKu Service Worker — 讓 App 可安裝到主畫面並離線遊玩。
 * 策略：同源請求「網路優先，離線退回快取」；外部請求（GA 等）直接走網路。 */
const CACHE = 'wangdoku-v3';
const ASSETS = [
  '/', '/index.html', '/styles.css', '/manifest.webmanifest',
  '/og-image.jpg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png',
  '/js/i18n.js', '/js/solver.js', '/js/difficulty.js',
  '/js/generator.js', '/js/game.js', '/js/main.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // 外部資源走網路
  e.respondWith(
    fetch(req)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/index.html')))
  );
});
