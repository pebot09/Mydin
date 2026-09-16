// Service worker: guarda o app inteiro no aparelho para abrir offline.
// Seus DADOS não passam por aqui — eles vivem no IndexedDB, nunca no cache.

const VERSAO = 'mydin-v2.0.0';

const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/dominio.js',
  './js/format.js',
  './js/ofx.js',
  './js/classify.js',
  './js/importar.js',
  './js/analytics.js',
  './js/charts.js',
  './js/ui.js',
  './js/cadastro.js',
  './js/views/painel.js',
  './js/views/fluxo.js',
  './js/views/tendencias.js',
  './js/views/ensino.js',
  './js/views/dados.js',
  './icons/favicon.svg',
  './icons/favicon-96.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSAO);
    // addAll falha inteiro se um arquivo faltar; adiciona um a um para ser tolerante
    await Promise.all(ARQUIVOS.map((u) => cache.add(u).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Navegação: tenta a rede (pega versão nova), cai para o cache se estiver offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const resposta = await fetch(req);
        const cache = await caches.open(VERSAO);
        cache.put('./index.html', resposta.clone());
        return resposta;
      } catch (_) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Demais recursos: cache primeiro (rápido e offline), rede em segundo plano.
  e.respondWith((async () => {
    const cacheado = await caches.match(req);
    if (cacheado) {
      fetch(req).then(async (r) => {
        if (r && r.ok) (await caches.open(VERSAO)).put(req, r);
      }).catch(() => {});
      return cacheado;
    }
    try {
      const r = await fetch(req);
      if (r && r.ok) (await caches.open(VERSAO)).put(req, r.clone());
      return r;
    } catch (_) {
      return Response.error();
    }
  })());
});
