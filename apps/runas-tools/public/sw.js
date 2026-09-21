const CACHE_PREFIX = "runas-tools-"
// `__BUILD_ID__` é substituído pelo hash do build em scripts/inject-sw-precache.mjs.
const BUILD_ID = "__BUILD_ID__"
const CACHE_NAME = `${CACHE_PREFIX}runtime-v7-${BUILD_ID}`
const MAX_CACHE_ENTRIES = 400
const BASE_URL = new URL("./", self.location.href)
const OFFLINE_URL = new URL("./", BASE_URL).href
const APP_SHELL = [
  "./",
  "./calculadora-dano/",
  "./calculadora-testes/",
  "./galeria-personagens/",
  "./cartas-runicas/",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./Norse.otf",
  "./Norsebold.otf",
  "./runic-card-back.webp",
].map((path) => new URL(path, BASE_URL).href)

/**
 * Todo o JavaScript e CSS do build, injetado por scripts/inject-sw-precache.mjs.
 * A ficha e as calculadoras são carregadas por `next/dynamic`: sem estes
 * arquivos em cache, abrir a ficha offline derruba o aplicativo inteiro na
 * página de erro do Next, porque o `import()` falha.
 */
const PRECACHE_ASSETS = []

async function trimCache(cache) {
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_CACHE_ENTRIES)).map((key) => cache.delete(key)))
}

async function cacheResponse(request, response) {
  if (!response || !response.ok) return response
  const cache = await caches.open(CACHE_NAME)
  await cache.put(request, response.clone())
  await trimCache(cache)
  return response
}

/** Nunca falha o install inteiro por causa de um arquivo: o resto continua servindo offline. */
async function precache(cache, urls) {
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(url, { cache: "reload" })
      if (response.ok) await cache.put(url, response)
    } catch {
      // Offline durante a instalação: o arquivo entra no cache no primeiro uso.
    }
  }))
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(async (cache) => {
      await cache.addAll(APP_SHELL)
      await precache(cache, PRECACHE_ASSETS.map((path) => new URL(path, BASE_URL).href))
    })
    .then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name))))
    .then(() => self.clients.claim()))
})

/** Última linha: uma resposta de erro é melhor que `respondWith(undefined)`, que lança. */
const OFFLINE_RESPONSE = () => new Response("", { status: 504, statusText: "Offline" })

async function networkFirst(request) {
  try {
    return await cacheResponse(request, await fetch(request))
  } catch {
    return (await caches.match(request)) ?? OFFLINE_RESPONSE()
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    return await cacheResponse(request, await fetch(request))
  } catch {
    return OFFLINE_RESPONSE()
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === "navigate") {
    event.respondWith(fetch(request)
      .then((response) => cacheResponse(request, response))
      .catch(async () => (await caches.match(request)) ?? (await caches.match(OFFLINE_URL)) ?? OFFLINE_RESPONSE()))
    return
  }

  // `/_next/static/` tem o hash do conteúdo no nome: o arquivo nunca muda,
  // então o cache é a fonte certa e a rede só serve para o que ainda falta.
  if (url.pathname.includes("/_next/static/") || ["image", "font", "style"].includes(request.destination)) {
    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})
