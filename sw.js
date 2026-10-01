/* Service worker do STUB.
   Estratégia: cacheia o "app shell" (o próprio index.html + manifest + ícones)
   pra abrir rápido e funcionar offline. Tudo que é dado vivo (TMDB, Supabase,
   fontes, CDN) passa direto pra rede — nunca é interceptado nem cacheado,
   pra não servir dados velhos de filmes ou quebrar login/autenticação. */

const CACHE_VERSION = "stub-shell-v10";  // v10: retrospectiva, push e share target
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

/* ==================== AVISOS NO CELULAR (Web Push) ====================
   A função de envio manda um JSON; aqui ele vira a notificação do sistema.
   Se vier vazio ou quebrado, mostra algo genérico em vez de sumir: o
   navegador exige que todo push assinado mostre alguma coisa. */

self.addEventListener("push", (event) => {
  let d = {};
  try{ d = event.data ? event.data.json() : {}; }
  catch(e){ d = { corpo: event.data ? event.data.text() : "" }; }

  const titulo = d.titulo || "STUB";
  const opcoes = {
    body: d.corpo || "Você tem uma novidade no STUB.",
    icon: d.icone || "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    image: d.imagem || undefined,
    /* mesma tag = avisos do mesmo assunto se substituem em vez de empilhar */
    tag: d.tag || "stub",
    renotify: true,
    timestamp: Date.now(),
    data: {
      url: d.url || "./",
      tipo: d.tipo || null,
      alvoTipo: d.alvoTipo || null,
      alvoId: d.alvoId || null,
      ator: d.ator || null
    }
  };
  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  event.waitUntil((async () => {
    const abas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    /* com o app já aberto: foca a janela e diz pra onde ir, sem recarregar */
    for(const aba of abas){
      if(new URL(aba.url).origin === self.location.origin){
        await aba.focus();
        aba.postMessage({ stub: "abrir-notificacao", tipo: d.tipo,
          alvoTipo: d.alvoTipo, alvoId: d.alvoId, ator: d.ator });
        return;
      }
    }
    /* app fechado: abre na URL que a notificação trouxe */
    await self.clients.openWindow(d.url || "./");
  })());
});

/* assinatura trocada pelo navegador (acontece sozinho de vez em quando):
   o app reassina e regrava assim que abrir de novo */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((abas) => abas.forEach((a) => a.postMessage({ stub: "reassinar-push" }))));
});
