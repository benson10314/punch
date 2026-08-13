/**
 * ════════════════════════════════════════════════════════════════════
 * 行動打卡 — 第二階段：Firebase 推播（後端）
 * ════════════════════════════════════════════════════════════════════
 *
 * 這是一個「加掛」檔案，不會動到你現有的打卡程式。
 * 在 Apps Script 編輯器按左側「檔案 ＋」→ 指令碼，命名為 Code.push，
 * 然後把這整份貼進去即可。
 *
 * ────────────────────────────────────────────────────────────────────
 * 安裝只有三個步驟（詳見 docs/firebase-setup.md）
 * ────────────────────────────────────────────────────────────────────
 * 1. 把服務帳戶 JSON 存到「專案設定 → 指令碼屬性」，
 *    屬性名稱：FIREBASE_SERVICE_ACCOUNT，值：整份 JSON 內容
 *
 * 2. 在你現有 doPost 的 action 路由裡，加上這四行：
 *
 *        case 'pushRegister':   return jsonOut_(pushRegister(d));
 *        case 'pushUnregister': return jsonOut_(pushUnregister(d));
 *        case 'pushTargets':    return jsonOut_(pushTargets(d));
 *        case 'pushSend':       return jsonOut_(pushSend(d));
 *
 *    （jsonOut_ 換成你自己那個「把物件變成 JSON 回應」的函式名稱；
 *      d 是已經 JSON.parse 過的請求內容。）
 *
 * 3. 把下面兩個 ★TODO 的驗證函式接到你現有的驗證邏輯上。
 *
 * 做完後在編輯器選 pushSelfTest 按執行，會告訴你設定對不對。
 *
 * ※ 兩張工作表（推播裝置、推播紀錄）會在第一次使用時自動建立，
 *   你不需要先手動開。
 */

var PUSH_CFG = {
  // ── 你現有的「員工」工作表 ───────────────────────────────
  // 名稱與欄位標題如果跟你的不一樣，改這裡就好（程式是照「標題文字」找欄位，
  // 所以欄位順序不同沒關係，但標題必須一字不差）。
  EMP_SHEET: '員工',
  EMP_HEADER: {
    empId: '員工編號',
    name:  '姓名',
    dept:  '部門',
    active:'狀態'      // 值是 啟用/停用 或 TRUE/FALSE 都能判斷
  },

  // ── 本功能自己會建立的兩張表 ─────────────────────────────
  DEVICE_SHEET: '推播裝置',
  LOG_SHEET:    '推播紀錄',

  SA_PROPERTY: 'FIREBASE_SERVICE_ACCOUNT',  // 服務帳戶 JSON 放在哪個指令碼屬性
  LOG_KEEP:    300,                          // 發送紀錄最多保留幾筆
  BATCH:       50                            // 每批送幾台裝置（Apps Script 有執行時間上限）
};

/* ════════════════════════════════════════════════════════════════════
   ★TODO 1／2：把這裡接到你現有的「員工登入 token」驗證
   ════════════════════════════════════════════════════════════════════
   打卡 App 呼叫 pushRegister 時會帶 {empId, token}，和 punch / today
   帶的是同一組。你現有的 punch 一定已經有一段在驗這個 token，
   把那段的函式名稱填進來即可。

   驗證通過請回傳員工資料物件，至少要有 empId；
   驗證失敗請直接 throw new Error('登入已失效，請重新登入')。 */
function pushAuthEmp_(d) {
  // ── 範例：如果你現有的驗證函式叫 checkToken_(empId, token) ──
  // return checkToken_(d.empId, d.token);

  throw new Error('尚未設定 pushAuthEmp_：請接上你現有的員工 token 驗證函式');
}

/* ════════════════════════════════════════════════════════════════════
   ★TODO 2／2：把這裡接到你現有的「管理者 token」驗證
   ════════════════════════════════════════════════════════════════════
   戰情室 dashboard 呼叫 pushTargets / pushSend 時會帶 {token}，
   和 board / empList / export 帶的是同一組。

   驗證失敗請 throw new Error('登入已失效，請重新登入')。 */
function pushAuthAdmin_(d) {
  // ── 範例：如果你現有的驗證函式叫 checkAdmin_(token) ──
  // return checkAdmin_(d.token);

  throw new Error('尚未設定 pushAuthAdmin_：請接上你現有的管理者 token 驗證函式');
}


/* ════════════════════════════════════════════════════════════════════
   工作表小工具
   ════════════════════════════════════════════════════════════════════ */

function pushSS_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/** 取得工作表，沒有就照 header 建一張 */
function pushSheet_(name, header) {
  var ss = pushSS_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, header.length).setValues([header])
      .setFontWeight('bold').setBackground('#f1f3f4');
    sh.setFrozenRows(1);
  }
  return sh;
}

function pushDeviceSheet_() {
  return pushSheet_(PUSH_CFG.DEVICE_SHEET,
    ['員工編號', 'FCM Token', '裝置', '註冊時間', '最後更新']);
}
function pushLogSheet_() {
  return pushSheet_(PUSH_CFG.LOG_SHEET,
    ['時間', '對象', '標題', '內容', '成功', '失敗']);
}

/** 讀整張表成物件陣列，key 用第一列的標題 */
function pushReadAll_(sh) {
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var head = v[0];
  return v.slice(1).map(function (row, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, c) { o[String(h).trim()] = row[c]; });
    return o;
  });
}

/** 讀員工名冊，回傳 [{empId,name,dept,active}] */
function pushEmployees_() {
  var sh = pushSS_().getSheetByName(PUSH_CFG.EMP_SHEET);
  if (!sh) throw new Error('找不到「' + PUSH_CFG.EMP_SHEET + '」工作表，請修改 PUSH_CFG.EMP_SHEET');

  var v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  var head = v[0].map(function (h) { return String(h).trim(); });
  var H = PUSH_CFG.EMP_HEADER;

  var idx = {};
  ['empId', 'name', 'dept', 'active'].forEach(function (k) {
    idx[k] = head.indexOf(H[k]);
  });
  if (idx.empId < 0) {
    throw new Error('「' + PUSH_CFG.EMP_SHEET + '」找不到欄位「' + H.empId +
                    '」，請修改 PUSH_CFG.EMP_HEADER');
  }

  return v.slice(1).map(function (r) {
    var a = idx.active < 0 ? true : r[idx.active];
    return {
      empId:  String(r[idx.empId]).trim(),
      name:   idx.name < 0 ? '' : String(r[idx.name]).trim(),
      dept:   idx.dept < 0 ? '' : String(r[idx.dept]).trim(),
      active: !(a === false || a === 'FALSE' || a === '停用' || a === '否' || a === 0)
    };
  }).filter(function (e) { return e.empId; });
}


/* ════════════════════════════════════════════════════════════════════
   員工端 API：註冊／取消註冊裝置
   ════════════════════════════════════════════════════════════════════ */

/** 打卡 App 開啟推播時呼叫。同一個 token 重複註冊只會更新時間，不會長出重複列。 */
function pushRegister(d) {
  pushAuthEmp_(d);
  var tok = String(d.fcmToken || '').trim();
  if (!tok) throw new Error('缺少推播識別碼');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = pushDeviceSheet_();
    var rows = pushReadAll_(sh);
    var now = new Date();
    var hit = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i]['FCM Token']) === tok) { hit = rows[i]; break; }
    }

    if (hit) {
      // 同一台手機換人登入時，這筆要改掛到新的員工身上，
      // 否則舊員工的通知會繼續推到這台手機。
      sh.getRange(hit._row, 1).setValue(d.empId);
      sh.getRange(hit._row, 3).setValue(d.device || '');
      sh.getRange(hit._row, 5).setValue(now);
    } else {
      sh.appendRow([d.empId, tok, d.device || '', now, now]);
    }
    return { ok: true, msg: '推播已開啟' };
  } finally {
    lock.releaseLock();
  }
}

/** 員工關閉推播或登出時呼叫 */
function pushUnregister(d) {
  pushAuthEmp_(d);
  var tok = String(d.fcmToken || '').trim();
  if (!tok) return { ok: true, msg: '沒有需要取消的裝置' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var n = pushDropTokens_([tok]);
    return { ok: true, msg: n ? '推播已關閉' : '這台裝置本來就沒有開啟推播' };
  } finally {
    lock.releaseLock();
  }
}

/** 刪掉指定的 token 列（用於取消註冊，以及清掉 FCM 回報已失效的 token） */
function pushDropTokens_(tokens) {
  if (!tokens || !tokens.length) return 0;
  var want = {};
  tokens.forEach(function (t) { want[t] = true; });

  var sh = pushDeviceSheet_();
  var rows = pushReadAll_(sh);
  var kill = rows.filter(function (r) { return want[String(r['FCM Token'])]; })
                 .map(function (r) { return r._row; });

  // 由下往上刪，才不會刪一列之後後面的列號整個位移
  kill.sort(function (a, b) { return b - a; })
      .forEach(function (row) { sh.deleteRow(row); });
  return kill.length;
}


/* ════════════════════════════════════════════════════════════════════
   管理端 API：對象清單／發送
   ════════════════════════════════════════════════════════════════════ */

/** 戰情室「推播通知」分頁開啟時呼叫，回傳每個員工有幾台裝置開了通知 */
function pushTargets(d) {
  pushAuthAdmin_(d);

  var emps = pushEmployees_();
  var devices = pushReadAll_(pushDeviceSheet_());

  var count = {};
  devices.forEach(function (r) {
    var id = String(r['員工編號']).trim();
    count[id] = (count[id] || 0) + 1;
  });

  var depts = [];
  var rows = emps.map(function (e) {
    if (e.dept && depts.indexOf(e.dept) < 0) depts.push(e.dept);
    return {
      empId: e.empId, name: e.name, dept: e.dept,
      active: e.active, devices: count[e.empId] || 0
    };
  });
  depts.sort();

  return {
    ok: true,
    rows: rows,
    depts: depts,
    configured: pushHasServiceAccount_(),
    log: pushRecentLog_()
  };
}

function pushRecentLog_() {
  var sh = pushLogSheet_();
  var rows = pushReadAll_(sh);
  var tz = pushSS_().getSpreadsheetTimeZone();
  return rows.slice(-30).reverse().map(function (r) {
    var at = r['時間'];
    return {
      at: at instanceof Date ? Utilities.formatDate(at, tz, 'MM/dd HH:mm') : String(at || ''),
      target: String(r['對象'] || ''),
      title: String(r['標題'] || ''),
      ok: Number(r['成功']) || 0,
      fail: Number(r['失敗']) || 0
    };
  });
}

/**
 * 發送推播。
 * d = { mode:'all'|'dept'|'emp', dept, empIds[], title, body, url }
 */
function pushSend(d) {
  pushAuthAdmin_(d);

  var title = String(d.title || '').trim();
  var body  = String(d.body || '').trim();
  if (!title || !body) throw new Error('標題與內容都要填');

  // 決定收件人
  var emps = pushEmployees_();
  var mode = d.mode || 'all';
  var wanted = {};
  var label;

  if (mode === 'emp') {
    var ids = d.empIds || [];
    if (!ids.length) throw new Error('沒有選擇任何員工');
    ids.forEach(function (i) { wanted[String(i).trim()] = true; });
    label = '指定 ' + ids.length + ' 人';
  } else if (mode === 'dept' && d.dept && d.dept !== '全部') {
    emps.forEach(function (e) { if (e.active && e.dept === d.dept) wanted[e.empId] = true; });
    label = '部門：' + d.dept;
  } else {
    emps.forEach(function (e) { if (e.active) wanted[e.empId] = true; });
    label = '全體員工';
  }

  var tokens = pushReadAll_(pushDeviceSheet_())
    .filter(function (r) { return wanted[String(r['員工編號']).trim()]; })
    .map(function (r) { return String(r['FCM Token']).trim(); })
    .filter(function (t) { return t; });

  if (!tokens.length) throw new Error('選到的對象都還沒有在手機上開啟推播通知');

  var res = pushFcmSend_(tokens, {
    title: title,
    body: body,
    url: String(d.url || '').trim() || './index.html',
    tag: 'hr-' + Date.now(),
    sentAt: String(Date.now())
  });

  // FCM 回報已失效的 token 直接清掉，下次就不會再算進人數
  if (res.stale.length) pushDropTokens_(res.stale);

  pushLogSheet_().appendRow([new Date(), label, title, body, res.sent, res.failed]);
  pushTrimLog_();

  return {
    ok: true, sent: res.sent, failed: res.failed,
    removed: res.stale.length,
    msg: '成功 ' + res.sent + ' 台，失敗 ' + res.failed + ' 台'
  };
}

function pushTrimLog_() {
  var sh = pushLogSheet_();
  var extra = sh.getLastRow() - 1 - PUSH_CFG.LOG_KEEP;
  if (extra > 0) sh.deleteRows(2, extra);
}


/* ════════════════════════════════════════════════════════════════════
   Firebase Cloud Messaging（HTTP v1）
   ════════════════════════════════════════════════════════════════════
   FCM 舊的 server key（legacy HTTP API）已經停用，現在必須用服務帳戶
   換 OAuth2 存取權杖。Apps Script 沒有現成的 Google Auth 程式庫可用在
   「非本專案」的服務帳戶上，所以這裡自己簽一個 JWT 去換 token。 */

function pushServiceAccount_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PUSH_CFG.SA_PROPERTY);
  if (!raw) {
    throw new Error('後端尚未設定 Firebase 服務帳戶：請到「專案設定 → 指令碼屬性」' +
                    '新增 ' + PUSH_CFG.SA_PROPERTY);
  }
  var sa;
  try { sa = JSON.parse(raw); }
  catch (e) { throw new Error(PUSH_CFG.SA_PROPERTY + ' 的內容不是合法的 JSON，請重貼一次'); }

  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error(PUSH_CFG.SA_PROPERTY + ' 缺少 client_email / private_key / project_id，' +
                    '請確認貼的是「服務帳戶金鑰」JSON');
  }
  return sa;
}

function pushHasServiceAccount_() {
  try { pushServiceAccount_(); return true; } catch (e) { return false; }
}

/** 拿 OAuth2 存取權杖。權杖一小時有效，快取 55 分鐘，不用每次都重簽。 */
function pushAccessToken_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('fcm_access_token');
  if (hit) return hit;

  var sa = pushServiceAccount_();
  var now = Math.floor(Date.now() / 1000);
  var b64 = function (o) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  };

  var unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  });
  var sig = Utilities.computeRsaSha256Signature(unsigned, sa.private_key);
  var jwt = unsigned + '.' + Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    },
    muteHttpExceptions: true
  });
  var body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() !== 200 || !body.access_token) {
    throw new Error('向 Google 換取推播權杖失敗：' +
                    (body.error_description || body.error || res.getContentText()));
  }

  cache.put('fcm_access_token', body.access_token, 3300);
  return body.access_token;
}

/**
 * 送出推播。
 * 一律送 data-only 訊息（不放 notification 欄位）：
 * 通知長什麼樣子完全由 sw.js 決定，也才不會發生瀏覽器自動顯示一則、
 * Service Worker 再顯示一則的重複通知。
 *
 * 回傳 { sent, failed, stale:[已失效的token] }
 */
function pushFcmSend_(tokens, data) {
  var sa = pushServiceAccount_();
  var at = pushAccessToken_();
  var url = 'https://fcm.googleapis.com/v1/projects/' + sa.project_id + '/messages:send';

  // FCM 的 data 欄位規定所有值都必須是字串，數字直接塞會被打回 400
  var payload = {};
  Object.keys(data).forEach(function (k) { payload[k] = String(data[k]); });

  var sent = 0, failed = 0, stale = [];

  for (var i = 0; i < tokens.length; i += PUSH_CFG.BATCH) {
    var batch = tokens.slice(i, i + PUSH_CFG.BATCH);
    var reqs = batch.map(function (t) {
      return {
        url: url,
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + at },
        payload: JSON.stringify({
          message: {
            token: t,
            data: payload,
            webpush: {
              headers: { Urgency: 'high', TTL: '86400' },
              fcmOptions: { link: payload.url }
            }
          }
        }),
        muteHttpExceptions: true
      };
    });

    var responses = UrlFetchApp.fetchAll(reqs);
    responses.forEach(function (r, k) {
      if (r.getResponseCode() === 200) { sent++; return; }
      failed++;
      // 404 UNREGISTERED＝使用者移除了 App 或清了瀏覽器資料
      // 400 INVALID_ARGUMENT＝token 格式已經不合法
      // 兩種都不會再好起來，直接從名單移除
      var txt = r.getContentText() || '';
      if (r.getResponseCode() === 404 ||
          txt.indexOf('UNREGISTERED') >= 0 || txt.indexOf('INVALID_ARGUMENT') >= 0) {
        stale.push(batch[k]);
      } else {
        console.warn('FCM 送出失敗 (' + r.getResponseCode() + ')：' + txt.slice(0, 300));
      }
    });
  }

  return { sent: sent, failed: failed, stale: stale };
}


/* ════════════════════════════════════════════════════════════════════
   自我檢查：在編輯器選這個函式按「執行」，看紀錄就知道還缺什麼
   ════════════════════════════════════════════════════════════════════ */
function pushSelfTest() {
  var out = [];
  var ok = function (m) { out.push('✅ ' + m); };
  var no = function (m) { out.push('❌ ' + m); };

  try {
    var sa = pushServiceAccount_();
    ok('服務帳戶讀取成功，專案：' + sa.project_id);
    try {
      pushAccessToken_();
      ok('向 Google 換取存取權杖成功（推播可以送出）');
    } catch (e) { no('換取存取權杖失敗：' + e.message); }
  } catch (e) { no(e.message); }

  try {
    var emps = pushEmployees_();
    ok('員工名冊讀取成功，共 ' + emps.length + ' 人（啟用 ' +
       emps.filter(function (e) { return e.active; }).length + ' 人）');
  } catch (e) { no(e.message); }

  var devices = pushReadAll_(pushDeviceSheet_());
  ok('已註冊推播裝置 ' + devices.length + ' 台');

  ['pushAuthEmp_', 'pushAuthAdmin_'].forEach(function (fn) {
    try {
      globalThis[fn]({});
      no(fn + ' 給空白請求也通過了，請確認驗證邏輯真的有在擋');
    } catch (e) {
      if (/尚未設定/.test(e.message)) no(fn + ' 還沒接上你現有的驗證函式（見檔案開頭 ★TODO）');
      else ok(fn + ' 已接上驗證邏輯');
    }
  });

  var msg = out.join('\n');
  console.log('\n===== 推播設定檢查 =====\n' + msg + '\n');
  return msg;
}
