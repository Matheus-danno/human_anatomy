// Service worker: guarda os modelos 3D no Cache Storage (cache-first). A URL de cada modelo traz o hash
// do conteúdo (?v=..., ver pipeline/models_manifest.mjs), então uma versão nova nunca é confundida com a
// antiga; ao guardar uma versão, as outras do mesmo arquivo são apagadas.
const CACHE = 'anatomia-modelos'
const MODEL = /\/models\/[^/]+\.glb$/

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !MODEL.test(url.pathname)) return
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) {
        for (const old of await cache.keys()) {
          if (new URL(old.url).pathname === url.pathname) await cache.delete(old)
        }
        await cache.put(event.request, response.clone())
      }
      return response
    }),
  )
})
