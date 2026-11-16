/* Tempo service worker โ€” caches the app shell so it opens instantly and installs as an app.
   API calls are never cached (always live data). Bump VERSION on every release. */
const VERSION = "tempo-v1.13.0";
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest", "/css/app.css", "/css/tempo.css", "/css/erp.css",
  "/js/app.js", "/js/core.js", "/js/i18n.js", "/js/i18n-erp.js", "/js/api.js", "/js/store.js", "/js/ui.js", "/js/dnd.js", "/js/brands.js", "/js/thai.js",
  "/js/views/auth.js", "/js/views/home.js", "/js/views/tasks.js", "/js/views/campaigns.js", "/js/views/influencers.js", "/js/views/creator-tools.js",
  "/js/views/timeline.js", "/js/views/projects.js", "/js/views/settings.js",
  "/js/views/calendar.js", "/js/views/finance.js", "/js/views/inventory.js", "/js/views/partners.js", "/js/views/inbox.js",
  "/assets/logo-mark.svg", "/assets/icon-192.png", "/assets/icon-512.png", "/assets/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }
  // network first, so a release shows up on the next load; the cache is only the offline fallback
  e.respondWith(caches.open(VERSION).then(cache =>
    fetch(e.request, { cache: "no-cache" })
      .then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; })
      .catch(async () => (await cache.match(e.request)) || Response.error())));
});
