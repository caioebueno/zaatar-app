const CACHE_VERSION = "zaatar-pwa-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/pwa-192.png", "/pwa-512.png"];
const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalhost() {
  return LOCALHOST_HOSTS.has(self.location.hostname);
}

self.addEventListener("install", (event) => {
  if (isLocalhost()) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (isLocalhost()) return;
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const offlineFallback = await caches.match("/");
        if (offlineFallback) return offlineFallback;
        throw new Error("Network error");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }

          const responseCopy = networkResponse.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(event.request, responseCopy);
          });

          return networkResponse;
        })
        .catch(() => {
          throw new Error("Network error");
        });
    })
  );
});
