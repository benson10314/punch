/* 行動打卡 — Service Worker
   目的：讓網頁可以「加入主畫面」變成 App，並在網路不穩時仍能開啟畫面。
   打卡 API 一律走網路，絕不快取。
   ※ 改版後請把 VERSION 加 1，使用者下次開啟就會自動更新。 */

const VERSION = 'v10';
const CACHE = 'punch-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  // 出勤戰情室（人資／主管 App）
  './dashboard.html',
  './dashboard.webmanifest',
  './dash-icon-192.png',
  './dash-icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // 只處理自家網域的 GET；打卡 API（script.google.com）直接放行
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 網路優先，但最多等 3 秒：訊號差時直接用手機裡的版本秒開，網路那份抓到後照樣更新快取（下次開啟生效）
  const fromNet = fetch(req).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  // 沒網路又沒快取時，退回該 App 自己的首頁（戰情室不要掉到打卡畫面）
  const home = () => caches.match(/dashboard/.test(req.url) ? './dashboard.html' : './index.html');

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (!hit) return fromNet.catch(() => home().then(h => h || Response.error()));
      const slow = new Promise(resolve => setTimeout(() => resolve(hit), 3000));
      return Promise.race([fromNet.then(res => res.ok ? res : hit, () => hit), slow]);
    })
  );
  e.waitUntil(fromNet.then(() => {}, () => {}));
});
