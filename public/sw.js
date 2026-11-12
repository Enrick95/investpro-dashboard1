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

// InvestPro Clip (investproclip.com) : son propre nom, son icône et son espace par défaut.
const CLIP_SITE = /(^|\.)investproclip\.com$/i.test(self.location.hostname);
const HOME_PATH = CLIP_SITE ? "/login" : "/dashboard/copieur";
// Seules les icônes de l'app Clip peuvent remplacer le logo InvestPro.
const notificationAsset = (value) => (typeof value === "string" && /^\/clip-app\/[a-z0-9-]+\.png$/.test(value) ? value : "/logo.webp");

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = String(payload.title || (CLIP_SITE ? "InvestPro Clip" : "InvestPro Trading")).slice(0, 100);
  const body = String(payload.body || "Vous avez une nouvelle information.").slice(0, 240);
  const tag = String(payload.tag || "investpro-notification").slice(0, 120);
  const target = new URL(String(payload.url || HOME_PATH), self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL(HOME_PATH, self.location.origin).href;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: notificationAsset(payload.icon),
    badge: notificationAsset(payload.badge),
    tag,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(String(event.notification.data?.url || HOME_PATH), self.location.origin);
  const url = target.origin === self.location.origin ? target.href : new URL(HOME_PATH, self.location.origin).href;
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
