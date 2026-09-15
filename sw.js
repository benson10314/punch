/* 行動打卡 — Service Worker
   目的：讓網頁可以「加入主畫面」變成 App，並在網路不穩時仍能開啟畫面。
   打卡 API 一律走網路，絕不快取。
   ※ 改版後請把 VERSION 加 1，使用者下次開啟就會自動更新。 */

const VERSION = 'v6';
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

  // network-first：有網路就拿最新版，沒網路才用快取
  e.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      // 沒網路又沒快取時，退回該 App 自己的首頁（戰情室不要掉到打卡畫面）
      .catch(() => caches.match(req).then(hit => hit ||
        caches.match(/dashboard/.test(req.url) ? './dashboard.html' : './index.html')))
  );
});
