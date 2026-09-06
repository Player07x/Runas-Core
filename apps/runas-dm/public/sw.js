const CACHE_NAME = "runas-dm-shell-__RUNAS_DM_BUILD_ID__"
const APP_SHELL = ["/", "/campaigns", "/wiki", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/runas-red-tree-bg.webp"]

function isCacheableUrl(url) {
  return url.origin === self.location.origin
    && !url.pathname.startsWith("/api/")
    && !url.pathname.startsWith("/cdn-cgi/")
    && !url.pathname.startsWith("/signin")
    && !url.pathname.startsWith("/callback")
}

function isRouterPayload(request, url) {
  return request.headers.has("RSC")
    || request.headers.has("Next-Router-Prefetch")
    || request.headers.has("Next-Router-State-Tree")
    || url.searchParams.has("_rsc")
}

async function cacheResponse(request, response) {
  const responseUrl = new URL(response.url || request.url)
  if (!response.ok || response.type !== "basic" || !isCacheableUrl(responseUrl)) return response
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
  return response
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((name) => name.startsWith("runas-dm-") && name !== CACHE_NAME).map((name) => caches.delete(name))))
    .then(() => self.clients.claim()))
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (!isCacheableUrl(url)) return

  // RSC payloads are tied to one build and must never survive a deployment.
  // The HTML shell remains available offline and cross-route navigation uses
  // full documents, so bypassing these responses does not reduce offline use.
  if (isRouterPayload(request, url)) {
    event.respondWith(fetch(request))
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request)
      .then((response) => cacheResponse(request, response))
      .catch(async () => (await caches.match(request)) || caches.match("/")))
    return
  }

  if (url.pathname.includes("/_next/static/") || ["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => cacheResponse(request, response))))
    return
  }

  event.respondWith(fetch(request)
    .then((response) => cacheResponse(request, response))
    .catch(() => caches.match(request)))
})
