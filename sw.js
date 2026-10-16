// Only the public shell is cached. GitHub API traffic and private data never enter Cache Storage.
const CACHE = 'networking-shell-v1';
const FILES = ['./', './index.html', './styles.css', './icon.svg', './manifest.webmanifest', './src/app.js', './src/model.js', './src/github.js', './src/config.js', './src/sync.js', './src/vault.js', './src/icons.js', './src/demo.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('networking-shell-') && k !== CACHE).map(k => caches.delete(k))))));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const allowed = FILES.map(file => new URL(file, scope).href);
  if (!allowed.includes(url.href)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(c => c.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || Response.error()));
});
