// Jev Decider service worker: keeps the app shell available offline.
// - Navigations: network first, fall back to the cached page.
// - Same-origin static assets: stale-while-revalidate.
// - Cross-origin (OpenRouter, data APIs): never cached.
const VERSION = "jev-v1";
const SHELL = "./";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.add(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(SHELL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL)),
    );
    return;
  }

  event.respondWith(
    caches.open(VERSION).then(async (c) => {
      const cached = await c.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
