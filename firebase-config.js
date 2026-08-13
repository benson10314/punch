/* ════════════════════════════════════════════════════════════
   行動打卡 — Firebase 推播設定
   ★★★ 這是第二階段推播「唯一需要填寫」的檔案 ★★★

   index.html（網頁）與 sw.js（Service Worker）都會讀這一份，
   所以只要改這裡，兩邊就同步生效，不會有一邊忘了改的問題。

   取得方式請看 docs/firebase-setup.md，簡述：
   1. Firebase 主控台 → 專案設定 → 一般 → 你的應用程式 → 網頁應用程式
      → 「SDK 設定和配置」選 Config，把整包貼到下面 FIREBASE_CONFIG
   2. 專案設定 → 雲端通訊 → 網頁設定 → 產生金鑰組
      → 把那串「金鑰組」貼到下面 VAPID_KEY

   ※ 這些值是「公開的」，放在前端原始碼裡是 Firebase 官方的正常做法，
     不是密鑰。真正要保密的是服務帳戶 JSON，那個只放在 Apps Script。

   ※ 沒填之前推播功能會自動停用，App 其他功能一切照常，不會壞掉。
   ════════════════════════════════════════════════════════════ */

self.FIREBASE_CONFIG = {
  apiKey:            'PASTE_API_KEY',
  authDomain:        'PASTE_PROJECT_ID.firebaseapp.com',
  projectId:         'PASTE_PROJECT_ID',
  storageBucket:     'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId:             'PASTE_APP_ID'
};

self.VAPID_KEY = 'PASTE_VAPID_KEY';

/* 用哪一版 Firebase SDK。網頁端與 SW 端必須同版，所以也放這裡。 */
self.FIREBASE_SDK_VERSION = '12.12.0';

/* 設定是否已經填好（還是佔位符）。兩邊都靠這個判斷要不要啟用推播。 */
self.FIREBASE_READY = (function () {
  var c = self.FIREBASE_CONFIG;
  return !!(c && c.apiKey && c.projectId && c.appId && c.messagingSenderId &&
            self.VAPID_KEY && !/^PASTE_/.test(c.apiKey) &&
            !/^PASTE_/.test(self.VAPID_KEY) && !/PASTE_/.test(c.projectId));
})();
