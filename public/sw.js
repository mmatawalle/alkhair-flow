const CACHE_NAME = "alkhair-flow-v2";

const coreAssets = [
  "./",
  "./manifest.webmanifest",
  "./brand-logo.png",
  "./apple-touch-icon.png",
  "./pwa-icon-192.png",
  "./pwa-icon-512.png",
  "./favicon.png",
  "./favicon.ico"
].map((path) => new URL(path, self.registration.scope).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(coreAssets))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(new URL("./", self.registration.scope).toString(), copy);
          });
          return response;
        })
        .catch(() => caches.match(new URL("./", self.registration.scope).toString()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      return (
        cachedResponse ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
      );
    })
  );
});
