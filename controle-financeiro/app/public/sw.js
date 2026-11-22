// Guarda o app no celular para abrir rápido e sem internet. Os dados vêm do servidor (/api).
// A versão muda a cada "npm run build": o celular percebe, baixa a nova e o app recarrega sozinho.
const VERSAO = '22111456';
const CACHE = 'bolso-' + VERSAO;
const ARQS = ['./', 'index.html', 'shim.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Rede primeiro (pega a versão nova), cache se estiver sem internet.
  e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
