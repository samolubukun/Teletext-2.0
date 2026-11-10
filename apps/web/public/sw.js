// Teletext 2.0 service worker (offline-pwa spec).
// - App shell: cache first.
// - /api/pages/*: network first with a short timeout; on failure serve the cached copy and mark it
//   with "x-teletext-cache: offline" so the reader shows an "OFFLINE COPY" badge.
// - The page cache keeps the most recently used 200 pages (LRU by write time).
const VERSION = "v1";
const SHELL = `tt-shell-${VERSION}`;
const PAGES = `tt-pages-${VERSION}`;
const MAX_PAGES = 200;
const NETWORK_TIMEOUT_MS = 4000;
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trimPages() {
  const cache = await caches.open(PAGES);
  const keys = await cache.keys();
  const excess = keys.length - MAX_PAGES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function markOffline(response) {
  const headers = new Headers(response.headers);
  headers.set("x-teletext-cache", "offline");
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function pageRequest(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) {
      await cache.delete(request);
      await cache.put(request, response.clone());
      trimPages();
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return markOffline(cached);
    return new Response(JSON.stringify({ error: { code: "offline", message: "You are offline." } }), {
      status: 504,
      headers: { "Content-Type": "application/json", "x-teletext-cache": "miss-offline" },
    });
  }
}

async function shellRequest(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return (await cache.match("/")) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/pages/")) {
    event.respondWith(pageRequest(request));
    return;
  }
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/dashboard")) return;
  if (request.mode === "navigate" || url.pathname.startsWith("/_next/static/") || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(shellRequest(request));
  }
});
