/* Service worker do STUB.
   Estratégia: cacheia o "app shell" (o próprio index.html + manifest + ícones)
   pra abrir rápido e funcionar offline. Tudo que é dado vivo (TMDB, Supabase,
   fontes, CDN) passa direto pra rede — nunca é interceptado nem cacheado,
   pra não servir dados velhos de filmes ou quebrar login/autenticação. */

const CACHE_VERSION = "stub-shell-v4";   // v4: página 404 com imagem de apoio
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./404.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((e) => console.warn("STUB SW: falha ao pré-cachear o app shell", e))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // TMDB, Supabase, fontes, CDN: sempre direto da rede

  // navegação (abrir/recarregar o app): tenta a rede primeiro (pra sempre pegar
  // a versão mais nova), e cai pro cache só se estiver offline
  if(req.mode === "navigate"){
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        /* sem rede: página em cache → app em cache → página de offline/manutenção */
        .catch(() => caches.match(req)
          .then((res) => res || caches.match("./index.html"))
          .then((res) => res || caches.match("./404.html")))
    );
    return;
  }

  // outros arquivos do próprio site (manifest, ícones): cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});
