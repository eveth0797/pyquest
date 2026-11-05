// PWA: cachea la app y también los archivos de Pyodide para jugar offline tras la primera carga
const C = "pyquest-v1";
const FILES = ["./", "index.html", "css/style.css", "js/levels.js", "js/app.js", "js/worker.js", "manifest.json", "icon.svg"];
self.addEventListener("install", e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const pyo = e.request.url.includes("/pyodide/");
  e.respondWith(pyo
    ? caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; }))
    : fetch(e.request).then(res => { const cp = res.clone(); caches.open(C).then(c => c.put(e.request, cp)); return res; }).catch(() => caches.match(e.request)));
});
