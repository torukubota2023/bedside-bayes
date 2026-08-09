/* ベイズ診察エンジン — offline shell
   ネットワーク優先・キャッシュ予備。更新は次回起動時に反映される。 */
const VERSION = "v2.9.0";
const CACHE = "bayes-" + VERSION;
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./icons/apple-touch-icon.png", "./icons/ogp.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
