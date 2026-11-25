// Guarda o app no celular para abrir rápido e sem internet. Os dados vêm do servidor (/api).
// A versão muda a cada "npm run build": o celular percebe, baixa a nova e o app recarrega sozinho.
const VERSAO = '25111121';
const CACHE = 'bolso-' + VERSAO;
const ARQS = ['./', 'index.html', 'shim.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'fonts/fontes.css', 'fonts/inter-latin.woff2', 'fonts/jakarta-latin.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Rede primeiro (pega a versão nova), mas sem esperar mais de 2 s: com internet lenta abre com o que está guardado,
  // e a resposta da rede, quando chegar, fica guardada para a próxima vez. Sem internet, abre direto do guardado.
  const doCache = () => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : null));
  const rede = fetch(e.request, {cache: 'no-cache'}).then(r => { if (r && r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; });
  e.waitUntil(rede.then(() => {}, () => {}));
  e.respondWith(new Promise(ok => {
    let feito = false; const usar = r => { if (!feito && r) { feito = true; ok(r); } };
    const t = setTimeout(() => doCache().then(usar), 2000);
    rede.then(r => { clearTimeout(t); usar(r); }, () => { clearTimeout(t); doCache().then(r => usar(r || Response.error())); });
  }));
});
