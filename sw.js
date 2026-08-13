/* 行動打卡 — Service Worker
   目的：
   1. 讓網頁可以「加入主畫面」變成 App，並在網路不穩時仍能開啟畫面。
   2. 接收 Firebase 雲端訊息（FCM）推播，在背景顯示通知。
   打卡 API 一律走網路，絕不快取。
   ※ 改版後請把 VERSION 加 1，使用者下次開啟就會自動更新。

   ───────────────────────────────────────────────────────────
   為什麼推播寫在這裡，而不是另外開一個 firebase-messaging-sw.js？
   ───────────────────────────────────────────────────────────
   Firebase SDK 預設會去「網域根目錄」找 /firebase-messaging-sw.js。
   但本站是相對路徑部署（例如 xxx.github.io/punch/），根目錄沒有那個檔，
   SDK 會 404 拿不到 token；而且一個 scope 只能有一個 Service Worker，
   另開一支就會把這支負責快取的 SW 頂掉。
   所以做法是：網頁端呼叫 getToken() 時明確把「這支 SW」的 registration
   傳進去，推播事件就會送到這裡來。

   ───────────────────────────────────────────────────────────
   為什麼這裡不 importScripts 載入 Firebase SDK？
   ───────────────────────────────────────────────────────────
   SW 端載 SDK 只是為了呼叫 onBackgroundMessage()，但那要在 SW 啟動時
   從網路抓 100KB 的檔案，離線時會整支 SW 掛掉（連快取都失效）。
   FCM 送來的其實就是標準 Web Push 事件，自己接 'push' 就好，
   又輕又不會斷網就壞。後端一律送 data-only 訊息，
   顯示通知完全由這裡負責，也就不會發生「SDK 自動顯示一則、
   自訂 handler 再顯示一則」的重複通知。 */

const VERSION = 'v3';
const CACHE = 'punch-' + VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './firebase-config.js',
  './icon-192.png',
  './icon-512.png'
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
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

/* ════════════════════════════════════════════════════════════
   推播
   ════════════════════════════════════════════════════════════ */

/** FCM data-only 訊息的 payload 會是 {data:{…}}；保險起見也接受直接放在最外層的形狀。 */
function readPayload(event) {
  if (!event.data) return {};
  let raw;
  try {
    raw = event.data.json();
  } catch (err) {
    // 不是 JSON 就當成純文字內容
    return { body: event.data.text() };
  }
  const d = (raw && raw.data) ? raw.data : raw;
  // 萬一後端誤送了 notification 欄位，也讓它能正常顯示
  const n = (raw && raw.notification) || {};
  return {
    title: d.title || n.title,
    body: d.body || n.body,
    url: d.url,
    tag: d.tag,
    sentAt: d.sentAt
  };
}

self.addEventListener('push', event => {
  const p = readPayload(event);
  const title = p.title || '行動打卡';
  const opts = {
    body: p.body || '',
    icon: './icon-192.png',
    badge: './favicon-32.png',
    // 同一個 tag 的通知會互相取代，避免人資連按兩次就跳出兩則一樣的
    tag: p.tag || 'punch-notice',
    renotify: true,
    requireInteraction: false,
    timestamp: p.sentAt ? Number(p.sentAt) || Date.now() : Date.now(),
    data: { url: p.url || './index.html' }
  };
  // 一定要顯示通知：收到推播卻不顯示，瀏覽器會判定為濫用並停掉之後的推播
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './index.html';
  const url = new URL(target, self.location.href).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // 已經開著就把那個視窗叫到前面，不要每次點都開新分頁
      for (const c of list) {
        if (c.url === url || c.url.startsWith(url.split('#')[0])) {
          return c.focus();
        }
      }
      // 沒開著、或開的是別頁，就開一個
      if (list.length && 'navigate' in list[0]) {
        return list[0].focus().then(c => c.navigate(url)).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })
  );
});
