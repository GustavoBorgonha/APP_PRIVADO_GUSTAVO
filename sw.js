// Service worker: guarda os arquivos do app para funcionar offline.
const CACHE = 'meu-controle-v27';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'panda.js', 'extrato.js', 'planilha-config.js', 'cidades.js', 'app.js', 'nuvem.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/panda.svg', 'fonts/outfit.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const guardar = (req, resp) => { const copia = resp.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return resp; };

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Bibliotecas do Firebase (versão fixa): cache primeiro.
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => guardar(e.request, resp))));
    return;
  }
  // Login e banco de dados (outros domínios) passam direto, sem cache.
  if (url.origin !== location.origin) return;
  // Arquivos do app: rede primeiro (para pegar atualizações), cache quando offline.
  e.respondWith(
    fetch(e.request).then(resp => guardar(e.request, resp))
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
