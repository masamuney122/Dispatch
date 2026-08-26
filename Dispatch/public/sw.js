const CACHE_NAME = "dispatch-shell-v1";
const ROOT = new URL("./", self.registration.scope).pathname;
const SHELL = [ROOT, `${ROOT}manifest.webmanifest`, `${ROOT}favicon.png`];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Programın fetch ile gönderdiği API request'leri cache'e girmez. Yalnızca
  // navigasyon ve statik uygulama dosyaları çevrimdışı kabuğa dahil edilir.
  const cacheableDestinations = new Set(["document", "script", "style", "image", "font", "manifest"]);
  if (!cacheableDestinations.has(event.request.destination)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match(ROOT))),
  );
});
