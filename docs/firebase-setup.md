# Firebase 推播設定手冊

第二階段「人資手動群發推播」的完整設定步驟。全部做完大約 20 分鐘，只需要做一次。

照著做就好，不需要懂 Firebase。有 ⚠️ 的地方請特別留意。

---

## 你會需要的東西

- 一個 Google 帳號（建議用公司帳號，不要用個人的，離職會很麻煩）
- 打卡系統的 Google 試算表與 Apps Script 專案（現成的）
- 這個 repo 的檔案編輯權限

---

## 第 1 步：建立 Firebase 專案

1. 打開 <https://console.firebase.google.com/> → **建立專案**
2. 專案名稱隨意，例如 `company-punch`
3. Google Analytics **可以關掉**，推播用不到
4. 等它跑完，按「繼續」

## 第 2 步：建立網頁應用程式，拿到 firebaseConfig

1. 專案首頁中間有一排圖示，點 **`</>`（網頁）**
2. 應用程式暱稱填 `打卡 App`，**不要**勾「Firebase Hosting」
3. 按「註冊應用程式」
4. 畫面會出現一段程式碼，裡面有一個 `firebaseConfig` 物件，長這樣：

   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy....",
     authDomain: "company-punch.firebaseapp.com",
     projectId: "company-punch",
     storageBucket: "company-punch.firebasestorage.app",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef123456"
   };
   ```

5. 把這六個值抄下來，等一下要用

> 之後想再看一次：專案設定（左上齒輪）→ 一般 → 捲到最下面「你的應用程式」

## 第 3 步：產生 VAPID 金鑰（網頁推播憑證）

1. 左上齒輪 → **專案設定** → 上方分頁 **雲端通訊（Cloud Messaging）**
2. 找到 **網頁設定 / Web configuration** 區塊 → **網頁推播憑證**
3. 按 **產生金鑰組**
4. 會出現一長串以 `B` 開頭的字串，**那就是 VAPID key**，抄下來

## 第 4 步：填進 `firebase-config.js`

打開 repo 根目錄的 `firebase-config.js`，把第 2、3 步抄到的值貼進去：

```js
self.FIREBASE_CONFIG = {
  apiKey:            'AIzaSy....',
  authDomain:        'company-punch.firebaseapp.com',
  projectId:         'company-punch',
  storageBucket:     'company-punch.firebasestorage.app',
  messagingSenderId: '123456789012',
  appId:             '1:123456789012:web:abcdef123456'
};

self.VAPID_KEY = 'BxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxA';
```

存檔、commit、推上去。

> **這些值放在前端會不會外洩？** 不會有問題。這是 Firebase 官方設計就公開的識別資訊，
> 任何人打開網頁原始碼都看得到，這是正常的。真正的密鑰是下一步的服務帳戶 JSON，
> 那個**只會放在 Apps Script**，絕對不能放進前端或 commit 進 repo。

> ⚠️ 這一步做完之前，打卡 App 上的「開啟推播通知」卡片會自動隱藏，
> 其他功能一切正常。所以就算中途停下來也不會弄壞現有系統。

## 第 5 步：下載服務帳戶金鑰（後端要用）

1. 專案設定 → 上方分頁 **服務帳戶（Service accounts）**
2. 按 **產生新的私密金鑰** → 確認產生
3. 瀏覽器會下載一個 `.json` 檔

⚠️ **這個檔案等於推播系統的鑰匙。**
- 不要 commit 進 Git
- 不要用 email 或通訊軟體傳
- 下一步用完就把下載的檔案刪掉

## 第 6 步：把金鑰存進 Apps Script

1. 打開打卡系統的 Google 試算表 → 選單「擴充功能 → Apps Script」
2. 左側齒輪 **專案設定**
3. 捲到最下面 **指令碼屬性** → **新增指令碼屬性**
   - 屬性名稱：`FIREBASE_SERVICE_ACCOUNT`
   - 值：用記事本打開第 5 步的 JSON 檔，**整份內容**（含頭尾大括號）複製貼上
4. 儲存指令碼屬性
5. 回去把第 5 步下載的 JSON 檔刪掉

## 第 7 步：貼上後端程式碼

1. 還在 Apps Script 編輯器，左側「檔案」旁邊按 **＋ → 指令碼**
2. 命名為 `Code.push`
3. 把 repo 裡 `apps-script/Code.push.gs` 的**全部內容**貼進去，存檔

### 7-1　接上路由

找到你現有的 `doPost`，裡面有一段依 `action` 分派的 `switch`（或一連串 `if`）。
在裡面加上這四行：

```js
case 'pushRegister':   return jsonOut_(pushRegister(d));
case 'pushUnregister': return jsonOut_(pushUnregister(d));
case 'pushTargets':    return jsonOut_(pushTargets(d));
case 'pushSend':       return jsonOut_(pushSend(d));
```

`jsonOut_` 換成你自己那個把物件轉成 JSON 回應的函式名稱（找一下 `case 'punch'`
那行是怎麼寫的，照抄就對了）。`d` 是已經 `JSON.parse` 過的請求內容。

### 7-2　接上兩個驗證函式

打開 `Code.push`，最上面有兩個標了 **★TODO** 的函式：

```js
function pushAuthEmp_(d) { ... }    // 驗證員工 token（跟 punch 用的同一組）
function pushAuthAdmin_(d) { ... }  // 驗證管理者 token（跟 board 用的同一組）
```

去看你現有的 `punch` 和 `board` 各自是呼叫哪個函式在驗 token，把那一行填進來，
並把原本的 `throw new Error('尚未設定…')` 刪掉。

> ⚠️ 這兩個一定要接。沒接的話推播 API 全部會失敗——這是故意的，
> 免得漏接變成「任何人都能對全公司發推播」。

### 7-3　確認 `員工` 工作表名稱

`Code.push` 開頭的 `PUSH_CFG.EMP_SHEET` 預設是 `'員工'`，
`EMP_HEADER` 預設欄位標題是 `員工編號 / 姓名 / 部門 / 狀態`。
如果你的表不叫這些名字，改成你實際的名稱。（欄位順序不用管，程式是照標題文字找的。）

### 7-4　自我檢查

在 Apps Script 編輯器上方的函式下拉選單選 **`pushSelfTest`**，按 **執行**。
第一次會要求授權，允許即可。看「執行紀錄」，全部是 ✅ 就成功了：

```
✅ 服務帳戶讀取成功，專案：company-punch
✅ 向 Google 換取存取權杖成功（推播可以送出）
✅ 員工名冊讀取成功，共 32 人（啟用 30 人）
✅ 已註冊推播裝置 0 台
✅ pushAuthEmp_ 已接上驗證邏輯
✅ pushAuthAdmin_ 已接上驗證邏輯
```

有 ❌ 就照訊息修。

## 第 8 步：重新部署

⚠️ **這步最常被忘記。** Apps Script 改完程式碼**不會自動生效**。

右上 **部署 → 管理部署作業 → 鉛筆圖示（編輯）→ 版本選「新版本」→ 部署**。

務必用「編輯現有部署」，**不要**建立新部署——建新的會產生不同網址，
前端的 `API_URL` 就對不上了。

## 第 9 步：測試

1. 手機打開打卡 App（⚠️ iPhone 請先「加入主畫面」，從桌面圖示開啟）
2. 登入後捲到最下面，會看到「開啟推播通知」卡片 → 按「開啟」
3. 允許通知權限 → 顯示「通知已開啟」
4. 電腦打開戰情室 `dashboard.html` → **推播通知** 分頁
5. 應該看到你自己那筆顯示「🔔 1 台裝置」
6. 填標題與內容 → 發送 → 手機應該幾秒內跳出通知

**把 App 切到背景再測一次**，確認背景也收得到（這才是推播真正的用途）。

---

## iPhone 的限制（⚠️ 請一定要跟員工說明）

Apple 對網頁推播的限制比 Android 嚴格很多：

| 條件 | 說明 |
|---|---|
| iOS 16.4 以上 | 更舊的 iPhone **完全無法**接收網頁推播，沒有替代方案 |
| 必須加入主畫面 | 在 Safari 分頁裡開著**收不到**，一定要「分享 → 加入主畫面」，再從桌面圖示開啟 |
| 權限要手動開 | 加入主畫面後重新登入，再按一次「開啟推播通知」 |
| 重裝就要重開 | 使用者把圖示從桌面刪掉再加回來，等於全新裝置，要重開通知 |

App 裡已經會自動偵測：iPhone 使用者若還沒加入主畫面，卡片會直接顯示引導文字，
不會給他一個按了也沒用的按鈕。

Android Chrome 沒有這些限制，在瀏覽器分頁裡就能收。

---

## 常見問題

**Q：戰情室顯示某人「未開啟通知」，但他說他開了**
請他從**主畫面圖示**（不是瀏覽器分頁）打開 App 重新登入一次。
App 每次登入都會自動把推播識別碼重新登記一次。

**Q：發送後顯示「失敗 N 台」**
最常見是那些裝置換過手機、清過瀏覽器資料，或把 App 從桌面刪掉了。
系統會自動把這種失效的裝置從名單移除，下次發送人數就會正確，不用手動處理。

**Q：可以收回已發送的推播嗎？**
不行，送出去就到手機上了。所以發送前會跳確認視窗，請務必看清楚再按。

**Q：一次最多能發給幾個人？**
Apps Script 單次執行有 6 分鐘上限，外部連線每天有配額
（一般帳號 20,000 次／日，Workspace 100,000 次／日）。
程式已經分批平行送出，數百人規模沒有問題。
如果公司規模到數千人且每天大量發送，再回頭改成批次排程。

**Q：員工換手機了怎麼辦？**
舊手機那筆會在下次發送失敗時自動清掉，新手機開啟通知後就會自動登記，不用管。

**Q：同一支手機給兩個人輪流用？**
後面登入的人開啟通知後，這台裝置會自動改掛到他名下，
前一個人不會再收到。（登出時也會主動退掉登記。）

**Q：為什麼推播沒有寫成獨立的 `firebase-messaging-sw.js`？**
Firebase SDK 預設會去**網域根目錄**找那個檔案，但本站是相對路徑部署
（例如 `xxx.github.io/punch/`），根目錄沒有那支檔案就會拿不到識別碼；
而且一個 scope 只能註冊一個 Service Worker，另開一支會把負責離線快取的
`sw.js` 頂掉。所以推播處理直接寫在 `sw.js` 裡，前端呼叫 `getToken()` 時
明確把這支 SW 傳進去。細節寫在 `sw.js` 檔案開頭的註解。

---

## 檔案對照

| 檔案 | 角色 | 要不要改 |
|---|---|---|
| `firebase-config.js` | apiKey / VAPID 金鑰 | ✅ 第 4 步要填 |
| `sw.js` | 背景收推播、顯示通知、點擊開啟 | ❌ 不用改 |
| `index.html` | 員工端「開啟推播通知」卡片、登記識別碼 | ❌ 不用改 |
| `dashboard.html` | 人資端「推播通知」分頁、群發面板 | ❌ 不用改 |
| `apps-script/Code.push.gs` | 後端 API、FCM 送出 | ✅ 第 7 步要接兩個驗證函式 |

改了 `sw.js` 之後記得把檔案開頭的 `VERSION` 加 1（例如 `v3` → `v4`），
使用者下次開啟才會拿到新版。
