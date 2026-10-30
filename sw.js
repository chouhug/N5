// 離線快取
// - App 自己的檔案（html、js、圖示）：有網路就先拿最新版，沒網路或太慢（3 秒）才用快取，所以上傳新版後重新打開就會更新
// - 字體、Firebase 程式庫：先用快取，背景更新（這些很少變）
// - 登入和資料庫的連線（googleapis 等）一律直接走網路，不快取
const CACHE = 'n5-v50';
const CORE = ['./', './index.html', './lang.js', './it.html', './es.html', './manifest.json', './icon-192.png', './icon-512.png'];
const CACHE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHE_HOSTS.includes(url.hostname)) return;
  if (url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
  if (sameOrigin) {
    // 網路優先：no-cache 會跟 GitHub 確認檔案有沒有變，沒變就很快回應
    e.respondWith(caches.open(CACHE).then(async c => {
      const net = fetch(req, { cache: 'no-cache' }).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; });
      const slow = new Promise(r => setTimeout(r, 3000));
      try {
        const res = await Promise.race([net, slow.then(() => c.match(req).then(hit => hit || net))]);
        return res || await c.match(req) || net;
      } catch (err) {
        const hit = await c.match(req);
        if (hit) return hit;
        throw err;
      }
    }));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
