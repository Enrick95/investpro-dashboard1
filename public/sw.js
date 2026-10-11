const CACHE_NAME = "investpro-static-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/logo.webp"]);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isStaticAsset =
    url.pathname === "/logo.webp" ||
    url.pathname.startsWith("/_next/static/");

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) {
          return response;
        }

        const copy = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, copy);
        });

        return response;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = String(payload.title || "InvestPro Trading").slice(0, 100);
  const body = String(payload.body || "Vous avez une nouvelle information.").slice(0, 240);
  const tag = String(payload.tag || "investpro-notification").slice(0, 120);
  const target = new URL(String(payload.url || "/dashboard/copieur"), self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/dashboard/copieur", self.location.origin).href;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/logo.webp",
    badge: "/logo.webp",
    tag,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(String(event.notification.data?.url || "/dashboard/copieur"), self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL("/dashboard/copieur", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
