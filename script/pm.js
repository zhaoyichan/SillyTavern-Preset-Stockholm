/* [SK-PM] boot guard */
(function(){
  var __boot = function(){
/* =====================================================================
   预设管理器 · 三合一 (manager.js)  ——  SillyTavern / 酒馆助手 脚本
   作者 Liwe（李伟）  ·  liwe

   独立于「状态球」的另一个脚本：不读后者的数据、不改后者的行为，
   localStorage 前缀 sk_pm_*（状态球是 sk_orb_*，两边不能共用，否则互相擦记忆）。

   三块：
     A 预设     列出条目 / 开关 / 就地编辑内容+条目名+角色 / 顶部 token / 开关方案
     B 世界书   整本启停 + 置顶 + 自定义分组；条目三档：禁用 / 关键词 / 常驻
     C 正则     全局 / 局部 / 预设 三组，默认折叠

   沿用的老教训（都是真踩过的，别删）：
     · 只挂在 window 上没用：脚本跑在小 iframe，位置换算要拿 parent window
     · updatePresetWith('in_use') 只改内存不落盘 → 必须再写一次真实预设名
     · prompts 只能就地改字段，绝不整体重建（会丢 identifier / injection_*）
     · 开关要同时写 prompts[i].enabled 和 prompt_order[0].order[j].enabled
     · 手机浏览器会「自动放大小字」把浮层撑爆 → text-size-adjust:100%
     · vh / inset:0 量的是地址栏收起时的尺寸 → 一律用 visualViewport 实测
     · z-index：遮罩不许盖住球；toast 最高
     · 排队中的延迟写入必须能取消，否则会把外面的新改动盖回去（两边互盖）
   ===================================================================== */
(function () {
"use strict";

var APP = "预设管理器", VER = "v0.3";
var PFX = "sk_pm_";                       /* localStorage 前缀 */
var EXT = "sk_pm";                        /* 预设里的 extensions 字段名 */

/* ── 环境：脚本跑在 iframe 里，真正的页面是 parent ── */
var Env = (function () {
  var win = window, pwin = window, pdoc = document;
  try {
    if (window.parent && window.parent !== window && window.parent.document) {
      pwin = window.parent; pdoc = window.parent.document;
    }
  } catch (e) {}
  return { win: win, pwin: pwin, pdoc: pdoc };
})();
var pwin = Env.pwin, pdoc = Env.pdoc;

/* ── ★ 我们自己的代码在文档里的行号区间 ──
   判「这个错是谁的」不能只看函数名（别家插件里也有 toast / render / mount），
   也不能只看「哪个 window 收到的」（window 的 error 事件照样会收到主页面
   里别的脚本冒上来的错 —— 状态球拉 update.json 拿到 404 的 HTML，
   JSON.parse 就报「Unexpected token '<'」，以前全算我们头上）。

   靠**行号区间**最准：我们脚本在 iframe 文档里占哪几行，是可以量出来的
   （在文件头、文件尾各造一个 Error，从它的 stack 里读出行号）。
   于是：栈里只要有一帧落在我们这段行号内 → 是我们的问题；否则 → 别人的。
   ⚠ 但「自己的 try/catch 里主动 catch 到的错」是另一回事：
      那种错不管栈里写的是谁，都得记 —— 那是我们自己代码路径上的失败。 */
var OWN_FILE = "", OWN_LO = 0, OWN_HI = 0;
function ownLine(stack) {
  /* 取栈里第一帧的 文件:行:列 —— 造 Error 的那个位置就是我们要的行号 */
  try {
    var lines = String(stack || "").split("\n");
    for (var i = 0; i < lines.length && i < 5; i++) {
      var L = lines[i];
      if (!/^\s*at\s/.test(L)) continue;      /* 第一行是 "Error"，不是栈帧 */
      var m = L.match(/\(?([^\s()]+):(\d+):(\d+)\)?\s*$/);
      if (m) return { file: m[1], line: parseInt(m[2], 10) };
    }
  } catch (e) {}
  return null;
}
try {
  var _own0 = ownLine((new Error()).stack);
  if (_own0) { OWN_FILE = _own0.file; OWN_LO = _own0.line; }
} catch (eOwn) {}

/* 重复注入先拆前一个 */
if (window.__SK_PM__) { try { window.__SK_PM__.destroy(); } catch (e) {} }

function ls(k, d) { try { var v = localStorage.getItem(PFX + k); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(PFX + k, v); } catch (e) {} }
function lsJSON(k, d) { try { var s = ls(k, ""); return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function lsSetJSON(k, v) { try { lsSet(k, JSON.stringify(v)); } catch (e) {} }

/* =====================================================================
   酒馆 API 桥
   各家分支（官方 / 酒馆助手 / TauriTavern）函数名不统一 —— 一律按候选名
   逐个试，并把「到底用的是哪一套」记下来，界面上如实写出来，不假装成功。
   ===================================================================== */
var _ctxCache;          /* getContext() 的结果缓存起来，别每调一次都重取 */
function stContext() {
  if (_ctxCache !== undefined) return _ctxCache;
  _ctxCache = null;
  try {
    var t = null;
    if (pwin && pwin.SillyTavern && typeof pwin.SillyTavern.getContext === "function") t = pwin.SillyTavern;
    else if (window.SillyTavern && typeof window.SillyTavern.getContext === "function") t = window.SillyTavern;
    if (t) { var c = t.getContext(); if (c && typeof c === "object") _ctxCache = c; }
  } catch (e) { _ctxCache = null; }
  return _ctxCache;
}
function getApi(name) {
  var src = [{ o: window }, { o: pwin },
             { o: pwin.TavernHelper }, { o: pwin.SillyTavern },
             { o: window.TavernHelper }, { o: window.SillyTavern }];
  /* ⚠ 分词器不在 SillyTavern 上，而在 SillyTavern.getContext() 返回的那一层对象里。
     少了这一句，脚本在真酒馆里也只能拿估算数，界面上永远写着「约」。 */
  var ctx = stContext();
  if (ctx) src.push({ o: ctx });
  for (var i = 0; i < src.length; i++) {
    try {
      var v = src[i].o && src[i].o[name];
      if (v !== undefined && v !== null) return { fn: v, owner: src[i].o };
    } catch (e) {}
  }
  return null;
}
function call(name) {
  var a = getApi(name); if (!a || typeof a.fn !== "function") return null;
  return { run: function () { return a.fn.apply(a.owner, arguments); }, api: a };
}
/* 试一串候选名，返回 {which, val}；全都没有 → null */
function tryOne(list, makeArgs) {
  for (var i = 0; i < list.length; i++) {
    var a = call(list[i]); if (!a) continue;
    try {
      var v = a.run.apply(null, makeArgs ? (makeArgs(list[i]) || []) : []);
      if (v !== undefined && v !== null) return { which: list[i], val: v };
    } catch (e) {}
  }
  return null;
}
function apiReady() { return !!call("getPreset") && !!call("updatePresetWith"); }
/* ── ★ 异步兜底 ──
   新版酒馆助手的读取接口有一批改成返回 Promise（官方文档写明
   getWorldbook(worldbook_name): Promise<WorldbookEntry[]>）。
   同步写法拿到 Promise 之后既不是数组、也没有 entries → 列表永远是空的。
   症状就是你说的「书都在，点进去一条条目也没有」。
   规矩：凡是「读」的调用都走这套 —— 同步值直接用，是 Promise 就等它落地再回填。 */
function isThen(v) { return !!v && (typeof v === "object" || typeof v === "function") && typeof v.then === "function"; }
function callAsync(name, args, cb) {
  var ret;
  try {
    var a = call(name); if (!a) return false;
    ret = a.run.apply(null, args || []);
  } catch (e) { return false; }
  if (isThen(ret)) {
    var p = ret;
    p.then(function (v) { cb(v); }, function (e) { cb(null); });
    return true;
  }
  cb(ret);
  return true;
}
/* ── 接口探测 ──
   哪个功能拿不到接口时调用：把「这台酒馆到底有哪些接口」写进
   localStorage(sk_pm_probe) + 控制台，用户点「复制接口诊断」贴回来就能对症下药 */
var PROBE_NAMES = [
  "getPreset", "updatePresetWith", "getPresetNames", "getLoadedPresetName", "loadPreset",
  "getWorldbookNames", "getGlobalWorldbookNames", "rebindGlobalWorldbooks",
  "getCharWorldbookNames", "rebindCharWorldbooks", "getChatWorldbookName", "rebindChatWorldbook",
  "getWorldbook", "updateWorldbookWith", "replaceWorldbook", "deleteWorldbook",
  "getTavernRegexes", "replaceTavernRegexes", "updateTavernRegexesWith"
];
var PROBE_WIN = ["world_names", "extension_settings", "oai_settings", "characters", "this_chid", "preset_manager", "saveSettingsDebounced"];
function probeDump() {
  var o = { ver: VER, when: new Date().toISOString(), api: {}, win: {} };
  PROBE_NAMES.forEach(function (n) { o.api[n] = !!call(n); });
  try { PROBE_WIN.forEach(function (k) { o.win[k] = !!(pwin && pwin[k] !== undefined); }); } catch (e) {}
  try { lsSet("probe", JSON.stringify(o)); } catch (e) {}
  try { console.info("[SK-PM] 接口探测", o); } catch (e) {}
  return o;
}
function probeCopy() {
  var o = probeDump();
  var txt = JSON.stringify(o, null, 1);
  var done = false;
  try {
    var n = (pwin && pwin.navigator) || navigator;
    if (n.clipboard && n.clipboard.writeText) { n.clipboard.writeText(txt); done = true; }
  } catch (e) {}
  if (!done) { try { ask("复制接口诊断（长按全选）", txt); } catch (e) {} }
  toast(done ? "诊断已复制，贴给 AI 就行" : "复制失败，诊断在控制台日志里（sk_pm_probe）");
}

/* 「当前预设名 / 预设清单」的异步结果缓存：Promise 只能晚到一次，到手后一直用它 */
var _pnCache = null, _ldCache = "";
function loadedName() {
  if (_ldCache) return _ldCache;
  try {
    var f = call("getLoadedPresetName"); var n = f ? f.run() : "";
    if (isThen(n)) { n.then(function (v) { _ldCache = (v && v !== "in_use") ? String(v) : ""; }, function () {}); return ""; }
    if (n && n !== "in_use") return String(n);
  } catch (e) {}
  return "";
}
/* ★ 不吃缓存地问一次酒馆「现在用的是哪个预设」
   切换预设时必须用这个 —— loadedName() 在异步接口下会把【第一次问到的旧名字】
   永久缓存下来（Promise 只能晚到一次），清缓存也没用：
   下一次调用又会把旧名字填回去，于是永远等不到新名字 → 切换看起来「没生效」。
   这个函数每次都重新问，不写缓存。 */
function loadedNameFresh(cb) {
  try {
    var f = call("getLoadedPresetName");
    if (!f) { cb(""); return; }
    var n = f.run();
    if (isThen(n)) {
      n.then(function (v) { cb((v && v !== "in_use") ? String(v) : ""); },
             function () { cb(""); });
      return;
    }
    cb((n && n !== "in_use") ? String(n) : "");
  } catch (e) { cb(""); }
}
/* 同步版：拿不到就退回缓存 —— 用在「渲染前必须立刻知道当前预设名」的地方。
   缓存（_ldCache）在切换时会清掉，所以这里的缓存不会是切换前的旧名。 */
function loadedNameFreshSync() {
  try {
    var f = call("getLoadedPresetName");
    if (f) {
      var n = f.run();
      if (!isThen(n)) return (n && n !== "in_use") ? String(n) : "";
    }
  } catch (e) {}
  return _ldCache || "";
}
function namesHas(n) {
  if (_pnCache) return _pnCache.indexOf(n) >= 0;
  try {
    var f = call("getPresetNames"); var a = f ? f.run() : null;
    if (isThen(a)) { a.then(function (v) { if (Array.isArray(v)) _pnCache = v.map(String); }, function () {}); return false; }
    return !!(a && Array.isArray(a) && a.indexOf(n) >= 0);
  } catch (e) { return false; }
}
/* ⚠ updatePresetWith('in_use') 只改内存：只有 name !== 'in_use' 才存盘。
   回报「成功」但退出酒馆再进来又回到旧样子 —— 所以每次都写两处。 */
function presetWriteBoth(updater) {
  var opts = { render: "immediate" };
  var c = call("updatePresetWith");
  var first = c.run("in_use", updater, opts);
  var name = loadedName(), ok = !!(name && namesHas(name)), second = null;
  if (ok) { try { second = c.run(name, updater, opts); } catch (e) { ok = false; } }
  return { first: first, second: second, name: (ok ? name : "") };
}

/* =====================================================================
   预设切换：不用进酒馆的预设界面，在这个脚本里点一下就换
   ---------------------------------------------------------------
   走 TH 的 loadPreset(name)。但有两个坑必须绕开：

   ① loadPreset 内部是异步的（selectPreset 要等酒馆把提示词应用完），
      它同步返回的 true 只代表「找到并开始切了」，不代表已经切完。
      → 切完要等一会儿再重读预设，否则读到的还是旧预设的条目。

   ② 切预设 = 换了整个提示词集合。切换期间：
      · 排队中的写入必须作废（不然迟到的旧写入会盖回新预设）
      · 我们的缓存（_ldCache / _pnCache）必须清掉
        （不清的话 loadedName() 还会报旧名字，切换看起来「没生效」）
      · tick() 里那段「酒馆换了预设 → 跟着换」要躲开，
        不然会跟手动切换抢着刷新、弹两次 toast
   ===================================================================== */
var switching = false, switchT = null;
/* 列出酒馆里全部预设（同步拿不到就等 Promise）。
   ★ 真机 10-27 实测：点了切换按钮「没弹窗也没报错」—— 就是因为 presetList 的回调
     可能永远等不到（Promise 挂起不是错误，什么都不会留下）。所以：
     ① 调用方先弹一个「正在读」的占位弹窗，证明点击生效了；
     ② 这里加 2.5 秒超时，卡住也给它一句明话。 */
function presetList(cb) {
  var f = call("getPresetNames");
  if (!f) { cb(null, "酒馆助手没有 getPresetNames 接口"); return; }
  var done = false;
  var fin = function (v, err) { if (done) return; done = true; cb(v, err); };
  var t = setTimeout(function () { fin(null, "酒馆没回应（等 2.5 秒没回话）"); }, 2500);
  var a;
  try { a = f.run(); } catch (e) {
    clearTimeout(t); errSave(ownErr(e));
    cb(null, String((e && e.message) || e));
    return;
  }
  if (isThen(a)) {
    a.then(function (v) { clearTimeout(t); fin(Array.isArray(v) ? v.map(String) : []); },
           function (e) { clearTimeout(t); fin(null, String((e && e.message) || e)); });
    return;
  }
  clearTimeout(t);
  cb(Array.isArray(a) ? a.map(String) : []);
}
/* 切预设。name 为空 / 已经在用这个 → 不动 */
function presetSwitch(name) {
  if (!name) return;
  var cur = presetName;
  if (name === cur) { toast("已经在用「" + name + "」了"); return; }
  var f = call("loadPreset");
  if (!f) { toast("酒馆助手没有 loadPreset 接口，切不了"); return; }

  /* 切换期间：作废排队写入 + 清缓存 + 挡住自动跟随 */
  cancelPending();
  _ldCache = ""; _pnCache = null;
  switching = true;
  setSync("busy", "正在切换…");

  var r = null, syncFalse = false;
  try { r = f.run(name); } catch (e) {
    errSave(ownErr(e));
    switching = false; setSync("", "已同步");
    toast("切换失败：" + String((e && e.message) || e).slice(0, 60));
    return;
  }
  /* ★ loadPreset 内部是异步的（selectPreset 要等酒馆应用完提示词）。
     新版接口很多直接返回 Promise —— reject 不接住就是**静默失败**：
     用户点了、什么提示都没有、酒馆也没换（真机 10-26 实测就是这样）。
     所以 Promise 必须挂 catch，把失败记进红条 + 弹出来告诉人。 */
  if (r && typeof r.then === "function") {
    r.then(function (v) {
      if (v === false) toast("酒馆那边拒绝了这次切换");
    }, function (err) {
      errSave(ownErr(err instanceof Error ? err : new Error("loadPreset 失败：" + String(err))));
      switching = false; setSync("", "已同步");
      toast("切换失败（红条上有原因）");
    });
  } else if (r === false) {
    syncFalse = true;
  }
  if (syncFalse) {
    switching = false;
    setSync("", "已同步");
    toast("酒馆那边拒绝了这次切换");
    return;
  }
  toast("已切到「" + name + "」，正在重读…");
  /* 酒馆那边应用提示词要时间 → 轮询等它真的换完，再重读。
     ⚠ 必须用 loadedNameFresh（不吃缓存）：loadedName() 在异步接口下会把
        第一次问到的【旧】名字永久缓存下来，清缓存也白清 —— 下一轮又填回旧名，
        于是永远等不到新名字，切换看起来就是「没生效」。
     ⚠ 重读要等 readPreset 的回调：异步接口下读取是 Promise 落地才生效的，
        不等就渲染 → 显示的还是旧预设。
     ⚠ 手机上应用预设慢（3 秒远远不够，实测切不动就是超时退出了）→ 给到 12 秒；
        超时后 switching 放开，心跳的「酒馆换了预设→跟着换」还会继续兜底。 */
  var tries = 0;
  clearTimeout(switchT);
  (function wait() {
    tries++;
    loadedNameFresh(function (n) {
      var done = (n === name) || (tries >= 40);
      if (!done) { switchT = setTimeout(wait, 300); return; }
      switching = false;
      readPreset(function (ok) {
        try {
          lastFp = snapItems();
          render(); updStat(true);
        } catch (e) { errSave(ownErr(e)); }
        setSync("", "已同步");
        if (n === name) toast("已切到预设「" + name + "」");
        else { toast("切换指令已发出，预设名还没变（可能是酒馆那边慢）"); pull(true); }
      });
    });
  })();
}
/* 预设切换列表：走弹窗（dlgOpen）承载，不再自己摆 fixed 下拉。
   ★ 为什么换掉（真机 10-27：点按钮「没弹窗也没报错」）：原来那个 .plst 是
     position:fixed + 手算坐标（按钮 rect 减 visualViewport 偏移）。手机上 iframe
     视口和地址栏之间只要有一点偏移，列表就整个飞到屏幕外 —— 显示是显示成功了，
     人看不见，而且一声不响。弹窗是 CSS 居中 + fitMask 实测尺寸的，没有这个雷。 */
function presetDlgShow() {
  if (view !== "preset") { switchView("preset"); }     /* 别的页签点了也先切回预设 */
  /* 先弹占位：证明「点了有反应」，清单读到了再换内容 */
  dlgOpen("切换酒馆预设",
    '<div class="ph">正在读预设清单…</div>',
    null, null);
  presetList(function (names, err) {
    var m = QI("dlgM"); if (!m) return;
    if (err) { m.innerHTML = '<div class="ph">' + esc(err) + '</div>'; return; }
    if (!names || !names.length) {
      m.innerHTML = '<div class="ph">酒馆助手没给出预设清单</div>';
      return;
    }
    var cur = presetName, h = '<div class="plist"><div class="ph">酒馆里的全部预设（当前：' + esc(cur) + '）</div>';
    for (var i = 0; i < names.length; i++) {
      var n = names[i], on = (n === cur);
      h += '<button class="pi' + (on ? " on" : "") + '" data-preset="' + escAttr(n) + '">'
        + (on ? '<span class="ck">' + SV.check + "</span>" : '<span class="ck"></span>')
        + '<span class="nm2">' + esc(n) + "</span></button>";
    }
    m.innerHTML = h + "</div>";
  });
}
function presetSettle(w, cb) {
  Promise.resolve(w.first).then(function (np) {
    if (w.second && w.second.then) {
      Promise.resolve(w.second).then(
        function () { cb(true, "", w.name, np); },
        function (e) { cb(false, String((e && e.message) || e), "", np); });
      return;
    }
    cb(true, "", w.name, np);
  }, function (e) { cb(false, String((e && e.message) || e), "", null); });
}

/* =====================================================================
   工具
   ===================================================================== */
function uiId() { return "i" + Math.random().toString(36).slice(2, 9); }
function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return esc(s).replace(/"/g, "&quot;"); }
function clampNum(n, a, b) { n = Number(n); return !isFinite(n) ? a : Math.max(a, Math.min(n, b)); }

/* ── 搜索三件套 ──
   ① txtHas：这一串里有没有这个词（两边都小写比；中文没有大小写，照样能对上）
   ② hlTx ：把命中的字垫一道浅黄。⚠ 必须先切片段再转义 —— 要是先 esc 了再去
            找词，万一命中落在 "&amp;" 这种转义实体里，标出来的就是一坨乱码
   ③ snip ：从命中处往回一点点开始截摘要。从头开始截的话，命中在第三段的东
            西，摘要里根本看不见它命在哪 */
function txtHas(s, q) { return !q || String(s == null ? "" : s).toLowerCase().indexOf(q) >= 0; }
function hlTx(s, q) {
  s = String(s == null ? "" : s);
  if (!q) return esc(s);
  var low = s.toLowerCase(), out = "", i = 0, k;
  while ((k = low.indexOf(q, i)) >= 0) {
    out += esc(s.slice(i, k)) + "<mark>" + esc(s.slice(k, k + q.length)) + "</mark>";
    i = k + q.length;
  }
  return out + esc(s.slice(i));
}
function snip(s, q, len) {
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  if (!q) return s.slice(0, len);
  var k = s.toLowerCase().indexOf(q);
  if (k < 0) return s.slice(0, len);
  var st = Math.max(0, k - 10);
  return (st ? "…" : "") + s.slice(st, st + len);
}

/* =====================================================================
   token：优先用酒馆自己的分词器（和它实际发给 AI 时算的是同一套），
   拿不到才退回估算 —— 并且必须在界面上标明是估算的，不拿估算充真数。
   ===================================================================== */
var tokCache = {};      /* content -> 真分词器算出来的 token 数（只有算准了才进这里） */
var tokPend = {};       /* content -> 1：已排进队列，等真数 */
var tokQueue = [];      /* 待精算的内容 */
var tokRunning = false;
var tokMode = "?";      /* "api" = 真分词器；"est" = 估算 */
var tokPending = 0;     /* 还有几条没算准（界面上要如实说出来） */

/* 分词器从哪来：
   ① SillyTavern.getContext().getTokenCountAsync —— 酒馆自己那个（OpenAI 后端走
      POST /api/tokenizers/openai/count，和它真发给 AI 时用的是同一套分词器）
   ② 兜底 getTokenCount（同步版，已 deprecated 但还在）
   ⚠ 一定要走 call()：stContext() 那一层才是分词器的所在（getApi 里已加进去）。 */
function tokFn() {
  var cand = ["getTokenCountAsync", "getTokenCount"];
  for (var i = 0; i < cand.length; i++) {
    var f = call(cand[i]);
    if (!f) continue;
    try {
      if (cand[i] === "getTokenCount") {
        var v = f.run("测一下 token");                    /* 同步版要先探一次能不能用 */
        if (typeof v === "number" && v > 0) {
          tokMode = "api";
          return function (s) { try { var r = call("getTokenCount").run(s); return typeof r === "number" ? r : tokEst(s); } catch (e) { return tokEst(s); } };
        }
      } else {
        /* 异步版：这里拿不到同步值，返回 null —— 真数由 tokFill 异步回填。
           ★ 这里千万别把估算值写进 tokCache：写了之后 tokFill 会以为
             「这条已经算过了」→ 异步真数永远补不进来 → 界面上一辈子显示估算。 */
        tokMode = "api";
        return function () { return null; };
      }
    } catch (e) {}
  }
  tokMode = "est";
  return tokEst;
}
/* 只在没有分词器时用：中文按字、英文按词粗估。宁可说「约」也不冒充实数 */
function tokEst(s) {
  s = String(s || "");
  if (!s) return 0;
  var zh = s.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g);
  var rest = s.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, " ");
  var words = rest.split(/[ \t\r\n]+/).filter(function (x) { return x.length; });
  return (zh ? zh.length : 0) + Math.round(words.length * 1.3);
}
var _tokImpl = null;
function tokImpl() { if (!_tokImpl) _tokImpl = tokFn(); return _tokImpl; }
/* ★ 真数才算准了：只有 tokCache 里有才算「算准了」 */
function tokHas(c) { return Object.prototype.hasOwnProperty.call(tokCache, c || ""); }
function tokOf(content) {
  var c = content || "";
  if (tokHas(c)) return tokCache[c];                 /* 算准了的 → 直接用 */
  var v = tokImpl()(c);
  if (v === null || v === undefined || !isFinite(v)) v = tokEst(c);   /* 没算准 → 先用估算顶上 */
  /* ⚠ 估算值【绝不】写进 tokCache —— 写了 tokFill 就以为这条算过了，
     异步真数再也补不进来（这就是以前 9578 比实际偏大的根因）。 */
  return v;
}
/* 已开启条目的 token 合计 —— 口径跟酒馆原生提示词管理器一致：
   ★ 只算「已开启」的条目；聊天记录 / 世界书 / 角色信息这些「上下文注入」
     不算在内（那些本来就不在预设条目里）。 */
function tokSum(list) {
  var arr = list || items, s = 0;
  for (var i = 0; i < arr.length; i++) if (arr[i].enabled) s += tokOf(arr[i].content);
  return s;
}
/* 还没算准的，异步补一遍 —— 用酒馆自己的分词器，算完刷新，数字会跳一下（那是真的在变准）
   ⚠ 每条都要问酒馆要一次 token（OpenAI 后端 = 一次 HTTP），几十条串行会等到天亮，
     所以开 4 个工人并行。 */
var TOK_WORKERS = 4;
function tokFill(list) {
  var arr = list || items;
  var f = call("getTokenCountAsync");
  if (!f) return;
  tokImpl();                       /* 强制探测一次：tokMode 得先定下来 */
  if (tokMode !== "api") return;
  /* 收集要算的：已开启 + 还没算准 + 不在队列里 */
  var que = [];
  for (var i = 0; i < arr.length; i++) {
    var c = arr[i].content || "";
    if (!arr[i].enabled) continue;
    if (!c) continue;
    if (tokHas(c) || tokPend[c]) continue;
    tokPend[c] = 1; que.push(c);
  }
  if (!que.length) { tokPending = pendCount(); return; }
  for (var q = 0; q < que.length; q++) tokQueue.push(que[q]);
  tokPending = pendCount();
  if (tokRunning) return;
  tokRunning = true;
  function worker() {
    var c = tokQueue.shift();
    if (c === undefined) {
      tokRunning = false;
      tokPending = pendCount();
      try { refreshStat(); } catch (e0) {}
      return;
    }
    var done = function (r) {
      try { delete tokPend[c]; } catch (e) {}
      if (typeof r === "number" && isFinite(r)) {
        tokCache[c] = r;                     /* ★ 真数进真身的地方 */
        try { tokCacheTrim(); } catch (eT) {}
        try { refreshStat(); } catch (e2) {}
        try { tokPaintRows(); } catch (e3) {}
      }
      tokPending = pendCount();
      worker();
    };
    try { Promise.resolve(f.run(c)).then(done, function () { done(null); }); }
    catch (e) { done(null); }
  }
  for (var w = 0; w < TOK_WORKERS; w++) worker();
}
/* 还有几条没算准（界面上要如实说出来，别拿估算冒充真数） */
function pendCount() {
  var n = 0;
  for (var k in tokPend) if (tokPend[k]) n++;
  return n;
}
/* 真数补进来以后，把各行上显示的 token 数字就地改过来。
   ⚠ 不用 renderList() 重渲染 —— 那样会打断正在编辑的条目、也会把滚动位置冲掉。
     这里只改两个数字（行尾的 tok 数 + 那条占比条），别的一概不动。 */
function tokPaintRows() {
  try {
    var list = QI("list"); if (!list) return;
    if (view === "preset") {
      var m = maxLen();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var row = list.querySelector('.row[data-id="' + it.id + '"]');
        if (!row) continue;
        var L = tokOf(it.content);
        var cc = row.querySelector(".cc");
        if (cc) cc.textContent = fmt(L);
        var bar = row.querySelector(".ratio > i");
        if (bar) bar.style.width = (it.enabled ? Math.round(L / m * 100) : 0) + "%";
      }
    } else if (view === "world") {
      var rs = list.querySelectorAll(".cc");
      /* 世界书行没有 id 锚点，按顺序对上号 */
      var flat = [];
      wbBooks.forEach(function (b) {
        b.entries.forEach(function (e) {
          if (b.whole !== true || triOf(e) === "off") return;
          flat.push(e.content);
        });
      });
      for (var k = 0; k < rs.length && k < flat.length; k++) rs[k].textContent = fmt(tokOf(flat[k]));
    }
    /* 全屏编辑页里的那一个数字 */
    var sk = QI("sheet");
    if (sk) {
      var c1 = sk.querySelector("[data-cnt]");
      if (c1) { var ed = byId(c1.getAttribute("data-cnt")); if (ed) c1.textContent = fmt(tokOf(draft && draft.content != null ? draft.content : ed.content)) + " tok"; }
    }
  } catch (e) {}
}
/* 缓存会随着改条目一直涨，清一清旧的（免得长时间开着把内存吃满） */
function tokCacheTrim() {
  var ks = Object.keys(tokCache);
  if (ks.length <= 600) return;
  for (var i = 0; i < 200; i++) delete tokCache[ks[i]];
}

/* =====================================================================
   状态
   ===================================================================== */
var items = [];        /* 预设条目：{id, name, role, content, enabled, identifier, locked, ph} */
var order = [];        /* 显示顺序：prompt_order[0].order 的 identifier 序列 */
var presetHoles = 0;   /* 预设里读出来的「空位」有几个（order 指向已删条目 —— 酒馆侧脏数据） */
var unusedItems = [];  /* 酒馆里存在、但没加进提示词模板的条目（只读展示，绝不写回） */
var pgGroups = [];     /* 预设条目分组 [{id, name, members:[identifier]}] —— 写进预设 extensions.sk_pm.groups */
var pSort = false;     /* 排序模式：每行给 ☰ 拖动把手 */
var pGrpMode = false;  /* 分组模式：每行左边给框，点框选中 → 确认收录 */
var pgSel = {};        /* 分组模式下勾中的 identifier */
var pgFold = {};       /* 分组折叠状态 */
var presetName = "";
var dirty = false;
var editingId = null;  /* 正在就地编辑的条目 id（预设 / 正则 共用） */
var draft = null;      /* 正在编辑但还没保存的内容（防止重渲染把字吃掉） */
var tab = "all";
var panelOpen = false;

var view = "preset";   /* preset | world | regex */
var wbBooks = [];      /* {name, scope:'global'|'character'|'chat', whole:true/false/null, entries:[], pinned} */
var wbGroups = [];     /* 自定义分组 [{id, name, books:[书名]}] —— 纯摆位习惯，存 localStorage */
var wbOpen = {};       /* 展开状态： "bk::书名" / "g:<id>" */
var edW = null;        /* 正在编辑的世界书条目 id（w0 / w1…） */
var draftW = null;
var edR = null;        /* 正在编辑的正则 id（r0 / r1…） */
var draftR = null;
var wbHow = "";        /* 世界书读的是哪套接口 */
var wbSelOK = true;    /* 拿得到拿不到「整本启停」 */

var rxBucket = { global: [], character: [], preset: [] };
var rxOpen = {};       /* global/character/preset → bool */
var rxHow = "";        /* 正则读的是哪套接口 */

var findQ = "";        /* 搜索词，已经小写化统治好的；空 = 没在搜 */
var findOn = false;    /* 搜索行展没展开 */

function lenOf(it) { return (it.content || "").length; }
function enabledTotal() { var s = 0; for (var i = 0; i < items.length; i++) if (items[i].enabled) s += lenOf(items[i]); return s; }
function onCount() { var n = 0; for (var i = 0; i < items.length; i++) if (items[i].enabled) n++; return n; }
function maxLen() { var m = 0; for (var i = 0; i < items.length; i++) { var t = tokOf(items[i].content); if (t > m) m = t; } return m || 1; }
function byId(id) { for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i]; return null; }

/* =====================================================================
   演示数据：只有在酒馆里找不到对应接口时才用它（上清酒馆数据时自动不用）
   ===================================================================== */
var MOCK = [
  ["Main Prompt", "system", "你是 {{char}}。请始终以第一人称扮演这个角色，保持性格一致，不要替 {{user}} 说话。", 1],
  ["世界设定", "system", "这是一个架空的近未来都市，义体改造普及，贫富差距极大。夜晚的霓虹掩盖着无数交易。", 1],
  ["角色卡补充", "system", "{{char}} 说话带一点懒洋洋的尾音，紧张时会不自觉转打火机。", 1],
  ["NSFW 允许", "system", "允许成人向描写，不回避暴力与欲望的心理刻画。", 0],
  ["输出格式", "system", "每段回复控制在 3-6 句，用引号表示台词，用括号表示动作与心理。在此基础上适度展开。", 1],
  ["记忆强化", "system", "每隔几轮用一句日常旁白复述当前场景的时间、地点与在场者，避免遗忘。", 0]
];
var mockStore = null;      /* 假「酒馆里的预设本体」 */
function mockPreset() {
  if (mockStore) return mockStore;
  mockStore = { prompts: [], prompt_order: [{ order: [] }], name: "演示预设" };
  MOCK.forEach(function (m, i) {
    var idf = "pm" + i;
    mockStore.prompts.push({ name: m[0], role: m[1], content: m[2], enabled: !!m[3], identifier: idf });
    mockStore.prompt_order[0].order.push({ identifier: idf, enabled: !!m[3] });
  });
  return mockStore;
}
function mockClone(p) { return JSON.parse(JSON.stringify(p)); }
function mockToggleOne() {
  var p = mockPreset();
  var i = Math.floor(Date.now() / 1000) % p.prompts.length;
  p.prompts[i].enabled = !p.prompts[i].enabled;
  try { p.prompt_order[0].order[i].enabled = p.prompts[i].enabled; } catch (e) {}
  return p.prompts[i];
}

/* ── 演示：世界书（名字用你本机真实的，条目是造的，字段名完全一致） ── */
/* 演示数据：书名和条目数照着你本机的真实情况做，让你一眼认得出来。
   ⚠ 故意只挑了中性的几本 —— 这份代码将来是进公开仓库的，
      你硬盘上那几本成人内容的书名一个都不许出现在源码里。
      条目内容全是合成的，不是从你文件里抄的。 */
var MOCK_WB = [
  { name: "jojo5's Lorebook", scope: "global", whole: true, ents: [
    ["系统叙事规则", [], "替身战斗以「能力相性」而非单纯战力决定胜负。解说者优先描述视觉出戏的部分。", "always", 0],
    ["替身规则", ["替身", "stand"], "替身是精神力的具象化。替身受伤，本体同样受伤。只有替身使者才能看见替身。", "always", 0],
    ["热情组织", ["热情", "passione"], "意大利最大的黑手党组织，老板身份成谜，泄露者死。", "keyword", 0],
    ["乔鲁诺", ["乔鲁诺", "giovanna"], "十五岁，金色卷发，梦想成为黑帮明星。能力「黄金体验」可赋予物体生命。", "always", 0]] },
  { name: "大乾风华录 VER 1.75 (2)", scope: "global", whole: true, ents: [
    ["基础设定：世界观", [], "架空王朝大乾，立国二百三十年。皇权与士林共治，边患不断。", "always", 0],
    ["王朝概览", ["大乾", "朝廷"], "当今圣上春秋鼎盛，然储位空悬，朝中党争渐起。", "disable", 0],
    ["边军与北狄", ["边军", "北狄"], "北境边军十二万，粮草常年不足；北狄今岁犯边三次，皆被挡在雁门之外。", "keyword", 0],
    ["风土人情", [], "民间重商，尤以江南织造为盛。士人以清谈为雅，鄙薄实务者众。", "disable", 0]] },
  { name: "Eldoria", scope: "global", whole: false, ents: [
    ["eldoria", ["eldoria", "wood"], "一片被遗忘的橡树林，林深处有一座会移动的石塔。", "always", 0],
    ["森林居民", ["forest"], "住在树冠层的族群，从不在地面留下脚印。", "keyword", 0]] },
  { name: "角色独立自主", scope: "global", whole: false, ents: [
    ["角色自主内核与独立意志", [], "角色拥有自己的目标链条，不应无条件迎合玩家。冲突时优先保有人设。", "keyword", 0],
    ["决策优先级", [], "生存 > 信念 > 关系 > 利益 > 舒适。", "disable", 0]] },
  { name: "自定义", scope: "character", whole: true, ents: [
    ["临时备注", [], "这条只有当前角色带得住。", "keyword", 0]] },
  { name: "当前聊天", scope: "chat", whole: true, ents: [] },
  { name: "当前聊天速记", scope: "chat", whole: false, ents: [
    ["这段立下的规矩", ["速记"], "这一段里先讲清楚：不许替玩家做决定，卡住就说不知道。", "keyword", 0]] },
  { name: "角色补丁", scope: "character", whole: true, ents: [
    ["语气补丁", [], "回话偏口语，句子短，少用书面语。", "always", 0],
    ["距离感", ["距离"], "不轻易交心，被追问才说多一点。", "keyword", 0]] },
  { name: "进巨's Lorebook", scope: "global", whole: false, ents: [] }
];
/* ── 演示：正则（名字也是你本机真实的） ── */
var MOCK_RX = {
  global: [
    { id: "rxA", name: "柏宝绘 · 生图标签占位", find: "\\((?:.+?)\\)", replace: "", disabled: false },
    { id: "rxB", name: "柏宝绘 · 隐藏生图标签", find: "\\{\\{img:.+?\\}\\}", replace: "", disabled: false },
    { id: "rxC", name: "删除极其", find: "极其", replace: "非常", disabled: true }
  ],
  character: [], preset: []
};

/* =====================================================================
   读：把当前预设装进 items
   （identifier 必须跟着走 —— 酒馆靠它认条目、索引排序表，没有它写回时只能
     整体重建 prompts，那 injection_* / marker 全得丢）
   ===================================================================== */
function readPreset(cb) {
  /* ★ 这一层必须包 try：预设里的脏数据（空位 / 缺字段）不该把整个读取打断 ——
     打断了的后果是「列表空着 + 再也察觉不到酒馆那边的改动」（用户 10-26 实测）。
     ★ cb：读【完了】的回调。新版接口返回 Promise 时，读取是异步落地的 ——
       切换预设后如果不等这个回调就渲染，显示的还是旧预设（用户 10-26 实测）。 */
  try { return readPresetInner(cb); }
  catch (e) { errSave(ownErr(e)); if (cb) { try { cb(false); } catch (x) {} } return false; }
}
function readPresetInner(cb) {
  var raw;
  if (apiReady()) {
    var c = call("getPreset"); if (!c) { if (cb) { try { cb(false); } catch (x) {} } return false; }
    /* ★★★ 必须优先读 in_use（官方文档原话：「in_use 预设虽然是从 getLoadedPresetName()
       预设加载而来, 但它的预设内容可能与 getLoadedPresetName() 预设不同」）：
       你在酒馆里改了预设但【没点保存】时，改动只存在于 in_use。
       以前读的是真名 → 酒馆里刚改的东西插件永远看不见（用户 10-26 反馈的正是这个）。
       读不到才退回真名。 */
    var nm0 = loadedName();
    var keys = ["in_use"];
    if (nm0 && nm0 !== "in_use" && namesHas(nm0)) keys.push(nm0);
    raw = null;
    for (var ki = 0; ki < keys.length; ki++) {
      var v;
      try { v = c.run(keys[ki]); } catch (eK) { errSave(ownErr(eK)); continue; }
      if (isThen(v)) {                    /* 新版接口返回 Promise：落地到了再补一遍 */
        v.then(function (val) {
          var ok = !!(val && applyPresetRaw(val));
          if (ok) wbRefreshed();
          if (cb) { try { cb(ok); } catch (x) {} }
        }, function () { if (cb) { try { cb(false); } catch (x) {} } });
        return false;
      }
      if (v && v.prompts) { raw = v; break; }
    }
    if (!raw) { if (cb) { try { cb(false); } catch (x) {} } return false; }
  } else {
    raw = mockPreset();
  }
  var ok2 = applyPresetRaw(raw);
  if (cb) { try { cb(ok2); } catch (x) {} }
  return ok2;
}
/* 酒馆的三类提示词 id：
   系统提示词（有正文）· 普通提示词（有正文）· 占位提示词（只是插入位置，本来就没正文）*/
var SYS_IDS = { main: 1, nsfw: 1, jailbreak: 1, enhanceDefinitions: 1 };
var PH_IDS = { worldInfoBefore: 1, personaDescription: 1, charDescription: 1, charPersonality: 1,
               scenario: 1, worldInfoAfter: 1, dialogueExamples: 1, chatHistory: 1 };
function applyPresetRaw(raw) {
  if (!raw || !raw.prompts) return false;
  /* 预设名：优先问酒馆「现在用的是哪个」（切换后这个名字会变）。
     ⚠ 用 loadedNameFresh（不吃缓存）：loadedName() 在异步接口下会返回 ""，
        于是退回 raw.name —— 那还是切换前那份 in_use 的旧名字。 */
  var nm = "";
  try { nm = loadedNameFreshSync(); } catch (e) {}
  presetName = nm || (raw.name || "当前预设");

  var src = Array.isArray(raw.prompts) ? raw.prompts : [];
  order = [];
  items = [];
  presetHoles = 0;
  for (var i = 0; i < src.length; i++) {
    var p = src[i];
    /* ★★★ 酒馆助手是【按 prompt_order 重建 prompts】的：
       order 里引用了已经从 prompts 删掉的条目时，find() 返回 undefined → 数组里留个空位。
       以前这里直接读 p.identifier → 整个「读预设」当场崩掉 →
       列表一条都不显示、也再也察觉不到酒馆那边的改动（用户 10-26 实测）。
       空位跳过就行；写回时 order 会按干净的 prompts 重建，脏数据顺手清掉。 */
    if (!p || typeof p !== "object") { presetHoles++; continue; }
    var idf = String(p.identifier !== undefined && p.identifier !== null ? p.identifier
            : (p.id !== undefined && p.id !== null ? p.id : ""));
    if (idf) order.push(idf);
    /* enabled 是 null/undefined → 这条压根没有开关概念（老预设），别替它造一个 */
    var has = (p.enabled !== undefined && p.enabled !== null);
    items.push({
      id: "it" + items.length,
      name: p.name || "（未命名）",
      role: p.role || "system",
      content: p.content || "",
      enabled: has ? !!p.enabled : true,
      identifier: idf,
      locked: !has,
      ph: !!PH_IDS[idf],                        /* 占位提示词：没有正文，不给编辑 */
      sys: !!SYS_IDS[idf]
    });
  }
  /* 显示顺序必须跟酒馆一致：以 prompt_order[0].order 为准（界面显示的就是它的项数）。
     prompts 数组自己的顺序跟显示顺序不是一回事。 */
  try {
    var po0 = (Array.isArray(raw.prompt_order) && raw.prompt_order[0] && Array.isArray(raw.prompt_order[0].order))
      ? raw.prompt_order[0].order : null;
    if (po0) {
      var seq = [];
      po0.forEach(function (o) { if (o && o.identifier) seq.push(String(o.identifier)); });
      var rank = {};
      seq.forEach(function (x, i) { if (rank[x] === undefined) rank[x] = i; });
      items.sort(function (a, b) {
        var ra = rank[a.identifier], rb = rank[b.identifier];
        if (ra === undefined && rb === undefined) return 0;
        if (ra === undefined) return 1;
        if (rb === undefined) return -1;
        return ra - rb;
      });
      order = seq.slice();
      items.forEach(function (it, i) { it.id = "it" + i; });
    }
  } catch (eO) {}

  /* 分组：写在预设里，换个设备也跟着预设走（extensions.sk_pm.groups） */
  pgGroups = [];
  try {
    var x = raw.extensions && raw.extensions[EXT];
    if (x && Array.isArray(x.groups)) pgGroups = JSON.parse(JSON.stringify(x.groups));
  } catch (e) {}
  /* 酒馆里【存在、但没被加进提示词模板】的条目（酒馆助手放在 prompts_unused）：
     它们在酒馆的下拉框里，不在模板里 —— 插件以前压根不显示，
     于是「条目怎么不见了」永远没有答案。这里只读出来给用户看，
     ⚠ 绝不写回（写回会把它们塞进 prompt_order，等于偷偷改了预设结构）。 */
  unusedItems = [];
  try {
    var un = Array.isArray(raw.prompts_unused) ? raw.prompts_unused : [];
    for (var u = 0; u < un.length; u++) {
      var q = un[u];
      if (!q || typeof q !== "object") continue;
      var uid = String(q.identifier !== undefined && q.identifier !== null ? q.identifier
              : (q.id !== undefined && q.id !== null ? q.id : ""));
      unusedItems.push({ identifier: uid, name: q.name || "（未命名）" });
    }
  } catch (e2) {}
  return true;
}

/* 指纹：用来发现「有人在酒馆那边动了条目」 */
function contentSig(s) {
  s = String(s == null ? "" : s);
  if (!s.length) return "0";
  /* 光比长度不够：正文改了同样字数（比如改了几个字）就发现不了。
     掺三个位置的字符进去，够灵又不慢。 */
  var h = s.length;
  h = h * 31 + s.charCodeAt(0);
  h = h * 31 + s.charCodeAt(s.length - 1);
  h = h * 31 + s.charCodeAt(Math.floor(s.length / 2));
  return String(h);
}
function snapItems() {
  var s = presetName + "|";
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    /* 名字也要进指纹：只比正文的话，酒馆里改了条目名插件根本察觉不到 */
    s += it.identifier + ":" + (it.enabled ? 1 : 0) + ":" + contentSig(it.name) + ":" + contentSig(it.content) + ";";
  }
  try { s += "|" + order.join(",") + "|" + JSON.stringify(pgGroups).length; } catch (e) {}
  return s;
}

/* =====================================================================
   写：把 items 与分组落进预设
   ⚠ 只能就地改字段：整体重建 prompts 会把 identifier / marker / injection_* / attach_* 全丢掉
   ===================================================================== */
function writePreset(then) {
  if (!apiReady()) {                    /* 演示模式：写进假本体 */
    setTimeout(function () {
      applyTo(mockPreset());
      items.forEach(function (it) { delete it.isNew; });
      then && then(true, mockPreset().name || "演示预设");
    }, 260);
    return;
  }
  var w;
  try {
    w = presetWriteBoth(function (preset) { applyTo(preset); return preset; });
  } catch (e) { then && then(false, String(e)); return; }
  presetSettle(w, function (ok, err, name) {
    /* isNew 只在两份都写完之后清：中途清会让真身那份漏掉新条目（实测踩过） */
    if (ok) items.forEach(function (it) { delete it.isNew; });
    then && then(ok, ok ? (name || "当前预设") : err);
  });
}

function applyTo(preset) {
  var byId = {}, byName = {}, i, q;
  var src = Array.isArray(preset.prompts) ? preset.prompts : [];
  /* ★★★ 写回前必须先把「空位」清掉：
     酒馆助手写回时会把 preset.prompts 逐条转回原始格式（fromPresetPrompt），
     数组里有个 undefined 它就当场抛错 —— 整次保存直接失败。
     顺带把酒馆侧那条「order 指向已删条目」的脏数据也一起清了。 */
  if (src.length) {
    var clean = [];
    for (i = 0; i < src.length; i++) {
      q = src[i];
      if (!q || typeof q !== "object") continue;
      clean.push(q);
    }
    if (clean.length !== src.length) {
      src = clean;
      preset.prompts = clean;
    }
  }
  for (i = 0; i < src.length; i++) {
    q = src[i]; if (!q) continue;
    /* ★ 转换格式字段叫 id，原始格式叫 identifier —— 两种都当钥匙 */
    var qk = q.identifier !== undefined && q.identifier !== null ? String(q.identifier) : "";
    if (!qk && q.id !== undefined && q.id !== null) qk = String(q.id);
    if (qk) byId[qk] = q;
    if (q.name && byName[q.name] === undefined) byName[q.name] = q;
  }
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    var base = (it.identifier && byId[it.identifier]) || (it.name && byName[it.name]);
    /* 新增的条目：预设里还没有 → 追加（只加这一条，绝不整体重建 prompts）。
       ⚠ updater 会被复用在 in_use 和真身两份克隆上 —— isNew 标记不能在这里清
       （清了第二份就不认账），统一挪到 writePreset 成功之后清。
       ★ id 和 identifier 都带上：酒馆助手写回时认 id，原始格式认 identifier
       ★ position 也给上：转换格式写回时按 position 还原注入位置，缺了会走默认值 */
    if (!base && it.isNew && it.identifier) {
      base = { identifier: it.identifier, id: it.identifier, name: it.name, role: it.role,
               content: it.content, enabled: !!it.enabled,
               position: { type: "relative" },
               injection_position: 0, injection_depth: 4, injection_order: 100 };
      src.push(base);
      byId[it.identifier] = base;
    }
    if (!base) continue;                              /* 预设里已经没有这条了，不硬塞 */
    base.name = it.name;
    base.role = it.role;
    if (!it.ph) base.content = it.content;            /* 占位提示词没有正文，别写 */
    if (!it.locked) base.enabled = !!it.enabled;
  }
  /* ★ 开关/顺序的写回分两种形态：
     ─ 原始格式（有 prompt_order）：enabled 两边都写，blk.order 按显示序列重排；
     ─ 酒馆助手转换格式（没有 prompt_order）：顺序就体现在 prompts 数组本身的顺序
       —— fromPreset 会按数组顺序重建 prompt_order，所以直接重排 src 数组。 */
  var po = preset.prompt_order;
  if (Array.isArray(po) && po.length) {
    var map = {};
    for (i = 0; i < items.length; i++) if (items[i].identifier) map[items[i].identifier] = items[i];
    for (var b = 0; b < po.length; b++) {
      var blk = po[b]; if (!blk || !Array.isArray(blk.order)) continue;
      for (i = 0; i < items.length; i++) {
        var nit = items[i];
        if (nit.isNew && nit.identifier && !nit.locked) {
          var have = false;
          for (var j2 = 0; j2 < blk.order.length; j2++) {
            var o2 = blk.order[j2];
            if (o2 && String(o2.identifier) === nit.identifier) { have = true; break; }
          }
          if (!have) blk.order.push({ identifier: nit.identifier, enabled: !!nit.enabled });
        }
      }
      for (var j = 0; j < blk.order.length; j++) {
        var o = blk.order[j]; if (!o || !o.identifier) continue;
        var m = map[String(o.identifier)];
        if (m && !m.locked) o.enabled = !!m.enabled;
      }
      blk.order.sort(function (a, b3) {
        var xa = order.indexOf(String(a.identifier)), xb = order.indexOf(String(b3.identifier));
        if (xa < 0 && xb < 0) return 0;
        if (xa < 0) return 1;
        if (xb < 0) return -1;
        return xa - xb;
      });
    }
  } else if (src.length) {
    /* 转换格式：按 items 的显示顺序重排 prompts 数组本体 */
    var rank2 = {};
    for (i = 0; i < order.length; i++) if (rank2[order[i]] === undefined) rank2[order[i]] = i;
    var seq2 = items.map(function (x) { return x.identifier; }).filter(Boolean);
    for (i = 0; i < seq2.length; i++) if (rank2[seq2[i]] === undefined) rank2[seq2[i]] = 10000 + i;
    src.sort(function (x, y) {
      /* ⚠ 参数名绝不能用 a/b：applyTo 里 po 循环的 var b 会提升遮蔽掉回调的 b，
         kb 永远 undefined → 每次比较都判「a 在前」→ 整个数组被反转（踩过） */
      var kx = x && (x.identifier !== undefined ? x.identifier : x.id), ky = y && (y.identifier !== undefined ? y.identifier : y.id);
      var xx = rank2[String(kx)], yy = rank2[String(ky)];
      if (xx === undefined && yy === undefined) return 0;
      if (xx === undefined) return 1;
      if (yy === undefined) return -1;
      return xx - yy;
    });
  }
  /* 分组写进预设本体（extensions.sk_pm.groups） */
  try {
    preset.extensions = preset.extensions || {};
    var x = preset.extensions[EXT];
    if (!x || typeof x !== "object") x = {};
    x.groups = JSON.parse(JSON.stringify(pgGroups));
    x.v = VER;
    preset.extensions[EXT] = x;
  } catch (e) {}
  return preset;
}

/* =====================================================================
   世界书
   整本书的启停不在书文件里，在 settings.json → world_info_settings
   .world_info.globalSelect（一个书名数组）。接口各家不统一 → 逐个试，
   全都没有就如实说「拿不到」，绝不假装能用。
   ===================================================================== */
var TRI = [["off", "禁用"], ["key", "关键词"], ["always", "常驻"]];
function triOf(e) { return e.disable ? "off" : (e.constant ? "always" : "key"); }
function triSet(e, t) { e.disable = (t === "off"); e.constant = (t === "always"); }
function triLabel(t) { for (var i = 0; i < TRI.length; i++) if (TRI[i][0] === t) return TRI[i][1]; return t; }

function wbHasApi() { return !!(call("getWorldbookNames") || call("getCharWorldbookNames") || call("getWorldbook")); }
/* ── 整本启停：酒馆助手的真实接口（2026-10-26 翻 worldbook.ts 核实） ──
   全局书：读 getGlobalWorldbookNames()（= settings.json 的 world_info.globalSelect），
           写 rebindGlobalWorldbooks(书名数组)
   角色书：读 getCharWorldbookNames("current") → {primary, additional}，
           写 rebindCharWorldbooks("current", {primary, additional})
   聊天书：读 getChatWorldbookName("current")，写 rebindChatWorldbook("current", 书名)
   之前瞎猜的 getCurrentWorldBooks / getWorldbookSelection 一串名字全不存在，
   所以实机一直显示「拿不到整本启停的接口」 */
/* 整本书归哪一类（全局 / 角色 / 聊天）：三个接口都可能异步，统一在这里收 */
function wbReadSel(cb) {
  var s = { global: null, primary: null, add: null, chat: undefined, ok: false };
  var left = 0, fin = function () { left--; if (left <= 0) cb && cb(s); };
  var jobs = [
    ["getGlobalWorldbookNames", [], function (v) {
      if (Array.isArray(v)) { s.global = v.map(String); s.ok = true; } }],
    ["getCharWorldbookNames", ["current"], function (v) {
      if (v && typeof v === "object") {
        s.primary = (v.primary === undefined ? null : v.primary);
        s.add = Array.isArray(v.additional) ? v.additional.map(String) : [];
        s.ok = true;
      } }],
    ["getChatWorldbookName", ["current"], function (v) { s.chat = v; s.ok = true; }]
  ];
  left = jobs.length;
  jobs.forEach(function (j) { if (!callAsync(j[0], j[1], function (v) { j[2](v); fin(); })) fin(); });
}
function wbScopeOf(name, sel) {
  if (sel.primary === name || (sel.add && sel.add.indexOf(name) >= 0)) return "character";
  if (sel.chat !== undefined && sel.chat !== null && sel.chat === name) return "chat";
  return "global";
}
function wbEntryKeys(k) {
  return (Array.isArray(k) ? k : (k ? String(k).split(",") : [])).map(function (x) {
    return (x instanceof RegExp) ? String(x) : String(x).trim();
  }).filter(Boolean);
}
/* 把「读到的那坨」摊平成我们自己的条目形态，两种源形态都认 */
function wbNormEntries(d) {
  var out = [];
  if (!d) return out;
  /* 两种形态都认：
     酒馆助手：WorldbookEntry[]（name / enabled / strategy.type / strategy.keys）
     酒馆原生：{entries: {uid: {comment / disable / constant / key}}} */
  var list = Array.isArray(d) ? d
    : (d.entries ? Object.keys(d.entries).map(function (k) { return d.entries[k]; }) : []);
  list.forEach(function (e, i) {
    if (!e || typeof e !== "object") return;
    var th = e.strategy !== undefined || (e.name !== undefined && e.comment === undefined);
    var k = th ? (e.strategy ? e.strategy.keys : []) : e.key;
    out.push({
      uid: String(e.uid === undefined ? i : e.uid),
      comment: String(th ? (e.name || "") : (e.comment || "")),
      key: wbEntryKeys(k),
      content: String(e.content || ""),
      disable: th ? (e.enabled === false) : !!e.disable,
      constant: th ? !!(e.strategy && e.strategy.type === "constant") : !!e.constant,
      vec: th ? !!(e.strategy && e.strategy.type === "vectorized") : !!e.vectorized,
      order: Number(th ? (e.position && e.position.order) : e.order) || 0,
      group: String(e.group || "")
    });
  });
  out.sort(function (a, b) { return a.order - b.order; });
  return out;
}
/* 读一本书的条目：同步接口当场有，异步接口（Promise）落地后再回填 */
function wbLoadEntries(b, done) {
  if (!callAsync("getWorldbook", [b.name], function (d) {
    b.entries = wbNormEntries(d);
    b.loading = false;
    b.got = b.entries.length > 0;
    done && done(b.entries.length);
  })) { b.loading = false; done && done(0); }
}
function wbLoad() {
  wbBooks = []; wbHow = "";
  if (!wbHasApi()) { wbLoadMock(); wbHow = "演示"; wbSelOK = true; return false; }
  wbReadSel(function (sel) { wbFill(sel); });
  return true;
}
function wbFill(sel) {
  wbSelOK = !!sel.ok;
  if (!sel.ok) probeDump();                /* 拿不到 → 把这台酒馆到底有什么落下来，好排查 */
  var names = [];
  callAsync("getWorldbookNames", [], function (n2) {
    if (Array.isArray(n2)) names = n2.map(String);
    wbBuild(names, sel);
  });
}
function wbBuild(names, sel) {
  if (names.length) wbHow = "getWorldbookNames";
  /* 就算书名列表没拿到，角色书 / 聊天书也能从绑定信息里凑出来 */
  if (sel.primary && names.indexOf(sel.primary) < 0) names.push(sel.primary);
  (sel.add || []).forEach(function (n) { if (names.indexOf(String(n)) < 0) names.push(String(n)); });
  if (sel.chat && names.indexOf(String(sel.chat)) < 0) names.push(String(sel.chat));
  if (!names.length) { wbLoadMock(); wbHow = "演示"; return; }
  var pin = lsJSON("pins", []);
  var left = names.length;
  var wbfin = function () { left--; if (left <= 0) { wbSort(); wbRefreshed(); } };
  names.forEach(function (n) {
    var scope = wbScopeOf(n, sel);
    var whole = null;
    if (scope === "character") whole = (sel.primary === n) || ((sel.add || []).indexOf(n) >= 0);
    else if (scope === "chat") whole = true;               /* 聊天书绑着就算启用 */
    else if (sel.global) whole = sel.global.indexOf(n) >= 0;
    var b = { name: n, scope: scope, whole: whole, entries: [], loading: true, pinned: pin.indexOf(n) >= 0 };
    wbBooks.push(b);
    wbLoadEntries(b, wbfin);
  });
  wbSort();                                 /* 条目还没回来也先按书排一遍，界面不空着 */
  wbRefreshed();
}
/* 异步数据到齐后重画：面板开着就照当前页重画，没开着也把列表补上
   （下次开面板就是最新样子；不重画的话，异步 preset 首帧会空着） */
function wbRefreshed() {
  try {
    if (!root) return;
    updStat(true);
    if (sheetIsOn()) sheetRender();
    renderList();
  } catch (e) {}
}
function wbLoadMock() {
  wbBooks = MOCK_WB.map(function (b) {
    return {
      name: b.name, scope: b.scope, whole: b.whole, pinned: false,
      entries: b.ents.map(function (e, i) {
        var o = { uid: "m" + i, comment: e[0], key: e[1], content: e[2], order: i, group: "" };
        triSet(o, e[3]); return o;
      })
    };
  });
  wbSort();
}
/* 置顶的排最前，其次启用的排前面 —— 你开的书要一眼看到 */
/* 置顶最前，其次「启用且真有条目」，最后是空的 / 没启用的。
   把空书也算进「启用优先」是没意义的 —— 它对结果零贡献，却会占着第一眼的位置。 */
function wbSort() {
  function rank(b) {
    if (b.pinned) return 0;
    return (b.whole === true && (b.entries || []).length) ? 1 : (b.whole === true ? 2 : 3);
  }
  wbBooks.sort(function (a, b) {
    var d = rank(a) - rank(b);
    if (d) return d;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
}
function wbFind(name) { for (var i = 0; i < wbBooks.length; i++) if (wbBooks[i].name === name) return wbBooks[i]; return null; }
function wbSavePins() { lsSetJSON("pins", wbBooks.filter(function (b) { return b.pinned; }).map(function (b) { return b.name; })); }

function wbWriteEnt(name, applyFn) {
  var a = call("updateWorldbookWith"); if (!a) return null;
  try {
    return a.run(name, function (wb) {
      if (Array.isArray(wb)) {                       /* 酒馆助手形态：条目数组 */
        wb.forEach(function (x) { if (x) applyFn(x, "th"); });
        return wb;
      }
      var ents = wb && wb.entries;                   /* 酒馆原生形态：{uid: 条目} */
      if (ents && typeof ents === "object") {
        Object.keys(ents).forEach(function (k) {
          var x = ents[k]; if (x) applyFn(x, "st");
        });
      }
      return wb;
    }, { render: "immediate" });
  } catch (e) { return null; }
}
/* 写条目字段：形态不同字段名不同，收口在这里 */
function wbApplyFields(x, shape, e) {
  if (shape === "th") {
    x.enabled = !e.disable;
    if (x.strategy) {
      if (!e.disable) x.strategy.type = e.constant ? "constant" : (e.vec ? "vectorized" : "selective");
    } else { x.disable = e.disable; x.constant = e.constant; }
    x.name = e.comment; x.content = e.content;
    if (x.strategy) x.strategy.keys = e.key.map(wbKeyVal); else x.key = e.key.slice();
  } else {
    x.disable = e.disable; x.constant = e.constant;
    x.comment = e.comment; x.content = e.content;
    x.key = e.key.slice();
  }
}
/* "/xxx/flags" 形态的键还原成 RegExp（酒馆助手的 keys 里本来就是它） */
function wbKeyVal(s) {
  var m = /^\/(.*)\/([gimsuy]*)$/.exec(String(s));
  if (m && m[1]) { try { return new RegExp(m[1], m[2]); } catch (e) {} }
  return s;
}
/* 整本启停：写得到就 true；接口没有 / 写挂了就 false（界面上如实说） */
function wbWriteWhole(name, nv) {
  var b = wbFind(name); if (!b) return "nofind";
  var scope = b.scope;
  if (scope === "global") {
    var g = call("getGlobalWorldbookNames"), w = call("rebindGlobalWorldbooks");
    if (!g || !w) return false;
    var cur;
    try { var v0 = g.run(); cur = (Array.isArray(v0) ? v0 : []).map(String); } catch (e) { return false; }
    var i = cur.indexOf(name);
    if (nv && i < 0) cur.push(name);
    if (!nv && i >= 0) cur.splice(i, 1);
    try { w.run(cur); } catch (e2) { return false; }
    return true;
  }
  if (scope === "character") {
    var c = call("getCharWorldbookNames"), w2 = call("rebindCharWorldbooks");
    if (!c || !w2) return false;
    var r;
    try { r = c.run("current"); } catch (e3) { return false; }
    var primary = (r && r.primary) || null, add = (r && Array.isArray(r.additional)) ? r.additional.slice() : [];
    var ia = add.indexOf(name);
    if (nv) { if (ia < 0) add.push(name); if (!primary) primary = name; }
    else { if (ia >= 0) add.splice(ia, 1); if (primary === name) primary = add.length ? add[0] : null; }
    try { w2.run("current", { primary: primary, additional: add }); } catch (e4) { return false; }
    return true;
  }
  if (scope === "chat") {
    var w3 = call("rebindChatWorldbook");
    if (!w3) return false;
    try { w3.run("current", nv ? name : null); }
    catch (e5) {
      try { w3.run("current", ""); } catch (e6) { return false; }
    }
    return true;
  }
  return "other";   /* 别的角色卡的书：酒馆接口只允许改当前角色 */
}
function wbToggleWhole(name) {
  var b = wbFind(name); if (!b) return;
  var nv = !(b.whole === true);
  if (!wbHasApi()) { b.whole = nv; render(); toast((nv ? "（演示）已启用「" : "（演示）已停用「") + name + "」"); return; }
  if (b.whole === null && b.scope === "character") { toast("这本书属于别的角色卡，酒馆只让改当前角色的绑定"); return; }
  /* ⚠ 这里刻意不重排：开关一拨列表就地重排的话，手指底下那本书会突然
     跑到别处（还是掐着自己的手指），看着像出错。排序只在载入 / 置顶时做。 */
  var r = wbWriteWhole(name, nv);
  if (r === "other") { toast("这本书属于别的角色卡，酒馆只让改当前角色的绑定"); return; }
  if (r === "nofind") return;
  if (r !== true) { wbSelOK = false; probeDump(); toast("写入失败：这台酒馆没开放「整本启停」接口（诊断已在控制台 / sk_pm_probe）"); render(); return; }
  b.whole = nv;
  render();
  /* 「已启用」那一类里关掉一本，它就从这一类里消失了 —— 这是对的，但得说一声，
     不然看起来像手滑把书删了 */
  toast((nv ? "已启用「" : "已停用「") + name + "」"
      + (!nv && !wbBook && wbCatOpen.on ? " · 已从「已启用」里移出" : ""));
}
/* 条目三档：改的是 disable / constant 两个字段 —— 这就是酒馆里蓝灯绿灯背后的东西 */
function wbSetTri(name, uid, t) {
  var b = wbFind(name); if (!b) return;
  var e = null;
  for (var i = 0; i < b.entries.length; i++) if (String(b.entries[i].uid) === String(uid)) e = b.entries[i];
  if (!e) return;
  triSet(e, t);
  if (!wbHasApi()) { render(); updStat(true); toast("（演示）「" + (e.comment || "(无标题)") + "」→ " + triLabel(t)); return; }
  var w = wbWriteEnt(name, function (x, shape) {
    var xu = String(x.uid === undefined ? "" : x.uid);
    if (xu === String(uid)) wbApplyFields(x, shape, e);
  });
  if (w === null) { toast("写入失败：没找到能改世界书条目的接口"); return; }
  render();
  toast("「" + (e.comment || "(无标题)") + "」→ " + triLabel(t));
}

/* =====================================================================
   正则：全局 / 局部 / 预设 三组
   ===================================================================== */
var RX_KEYS = [["global", "全局"], ["character", "局部"], ["preset", "预设"]];
function rxHasApi() { return !!call("getTavernRegexes"); }
/* 两种形态归一化（2026-10-26 实机三组全空的根因：getTavernRegexes 返回的是
   TavernRegex 形态 script_name / find_regex / enabled，之前按原生
   RegexScriptData 的 scriptName / findRegex / disabled 去读 → 字段全对不上） */
function rxNorm(arr, type) {
  var out = [];
  (arr || []).forEach(function (r, i) {
    if (!r || typeof r !== "object") return;
    var name = (r.script_name !== undefined ? r.script_name : r.scriptName);
    var find = (r.find_regex !== undefined ? r.find_regex : r.findRegex);
    var rep = (r.replace_string !== undefined ? r.replace_string : r.replaceString);
    var dis = (r.disabled !== undefined ? !!r.disabled : (r.enabled !== undefined ? !r.enabled : false));
    out.push({
      id: "rx" + type + i, type: type,
      name: String(name || ("正则 " + (i + 1))),
      find: String(find || ""), replace: String(rep || ""),
      disabled: dis, raw: r
    });
  });
  return out;
}
function rxLoad() {
  rxBucket = { global: [], character: [], preset: [] }; rxHow = "";
  if (rxHasApi()) {
    try {
      var a = call("getTavernRegexes");
      var got = false, left = RX_KEYS.length;
      var fin = function () {
        left--; if (left > 0) return;
        if (got) { rxHow = "getTavernRegexes"; }
        else if (rxFallbackRead()) { rxHow = "直读酒馆设置（兜底）"; probeDump(); }
        else { rxLoadMock(); rxHow = "演示"; }
        wbRefreshed();
      };
      RX_KEYS.forEach(function (kv) {
        var arr;
        try { arr = a.run({ type: kv[0] }); } catch (e) { fin(); return; }
        if (isThen(arr)) {                    /* 新版返回 Promise：落地了才填 */
          arr.then(function (r2) {
            if (Array.isArray(r2)) { rxBucket[kv[0]] = rxNorm(r2, kv[0]); got = true; }
            fin();
          }, function () { fin(); });
          return;
        }
        if (Array.isArray(arr)) { rxBucket[kv[0]] = rxNorm(arr, kv[0]); got = true; }
        fin();
      });
      return true;
    } catch (e) {}
  }
  /* 兜底：绕开酒馆助手直接摸酒馆本体（解包核实过的存放位置） */
  if (rxFallbackRead()) { rxHow = "直读酒馆设置（兜底）"; probeDump(); return true; }
  rxLoadMock(); rxHow = "演示"; return false;
}
function rxFallbackRead() {
  var got = false;
  try {
    var es = pwin && pwin.extension_settings;
    if (es && Array.isArray(es.regex)) { rxBucket.global = rxNorm(es.regex, "global"); got = true; }
  } catch (e) {}
  try {
    var os = pwin && pwin.oai_settings;
    var pr = os && os.extensions && os.extensions.regex_scripts;
    if (Array.isArray(pr)) { rxBucket.preset = rxNorm(pr, "preset"); got = true; }
  } catch (e2) {}
  try {
    var ch = pwin && pwin.characters, ci = pwin && pwin.this_chid;
    var cr = ch && ch[ci] && ch[ci].data && ch[ci].data.extensions && ch[ci].data.extensions.regex_scripts;
    if (Array.isArray(cr)) { rxBucket.character = rxNorm(cr, "character"); got = true; }
  } catch (e3) {}
  return got;
}
function rxLoadMock() {
  rxBucket = { global: [], character: [], preset: [] };
  RX_KEYS.forEach(function (kv) {
    rxBucket[kv[0]] = (MOCK_RX[kv[0]] || []).map(function (r, i) {
      return { id: "rx" + kv[0] + i, type: kv[0], name: r.name, find: r.find, replace: r.replace, disabled: !!r.disabled, raw: null };
    });
  });
  rxHow = "演示";
}
function rxAll() { return rxBucket.global.concat(rxBucket.character, rxBucket.preset); }
function rxById(id) { var a = rxAll(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
/* 归一化 → 酒馆助手 TavernRegex 形态（replaceTavernRegexes 吃这个） */
function rxToTH(r) {
  var raw = r.raw || {};
  return {
    id: raw.id !== undefined ? raw.id : "skpm-" + Math.random().toString(36).slice(2, 10),
    script_name: r.name,
    enabled: !r.disabled,
    find_regex: r.find,
    trim_strings: raw.trim_strings || raw.trimStrings || [],
    replace_string: r.replace,
    source: raw.source || { user_input: true, ai_output: true, slash_command: false, world_info: false, reasoning: false },
    destination: raw.destination || { display: true, prompt: false },
    run_on_edit: raw.run_on_edit !== undefined ? raw.run_on_edit : (raw.runOnEdit !== undefined ? raw.runOnEdit : true),
    min_depth: raw.min_depth !== undefined ? raw.min_depth : (raw.minDepth !== undefined ? raw.minDepth : null),
    max_depth: raw.max_depth !== undefined ? raw.max_depth : (raw.maxDepth !== undefined ? raw.maxDepth : null)
  };
}
/* 归一化 → 酒馆原生 RegexScriptData（兜底直写 / 导出用） */
function rxToRaw(r) {
  if (r.raw && r.raw.scriptName !== undefined) return r.raw;   /* 本来就是原生形态 */
  var th = r.raw && r.raw.script_name !== undefined ? r.raw : rxToTH(r);
  return {
    id: th.id, scriptName: th.script_name, disabled: !th.enabled,
    runOnEdit: th.run_on_edit !== undefined ? th.run_on_edit : true,
    findRegex: th.find_regex, trimStrings: th.trim_strings || [],
    replaceString: th.replace_string,
    placement: [0, 1, 2, 3].filter(function (p) {
      var s = th.source || {};
      return (p === 0 && s.user_input) || (p === 1 && s.ai_output) || (p === 2 && s.slash_command) || (p === 3 && s.world_info);
    }),
    substituteRegex: 0,
    minDepth: th.min_depth, maxDepth: th.max_depth,
    markdownOnly: !!(th.destination && th.destination.display),
    promptOnly: !!(th.destination && th.destination.prompt)
  };
}
function rxFallbackWrite(type, normArr) {
  var rawArr = normArr.map(rxToRaw);
  try {
    if (type === "global" && pwin && pwin.extension_settings) {
      pwin.extension_settings.regex = rawArr;
      if (pwin.saveSettingsDebounced) pwin.saveSettingsDebounced();
      return true;
    }
    if (type === "preset" && pwin && pwin.oai_settings) {
      pwin.oai_settings.extensions = pwin.oai_settings.extensions || {};
      pwin.oai_settings.extensions.regex_scripts = rawArr;
      if (pwin.saveSettingsDebounced) pwin.saveSettingsDebounced();
      return true;
    }
    if (type === "character" && pwin && pwin.characters) {
      var c = pwin.characters[pwin.this_chid];
      if (c) {
        c.data = c.data || {}; c.data.extensions = c.data.extensions || {};
        c.data.extensions.regex_scripts = rawArr;
        if (pwin.saveSettingsDebounced) pwin.saveSettingsDebounced();
        return true;
      }
    }
  } catch (e) {}
  return false;
}
function rxCommit(r) {
  if (rxHow === "演示") return true;         /* 演示模式：数据只在内存里改 */
  var arr = rxBucket[r.type];
  if (rxHasApi()) {
    try { var a = call("replaceTavernRegexes"); if (a) { a.run(arr.map(rxToTH), { type: r.type }); return true; } } catch (e) {}
  }
  if (rxFallbackWrite(r.type, arr)) return true;
  probeDump();
  toast("写入失败：没找到能改正则的接口（诊断已落 sk_pm_probe）");
  return false;
}
function rxToggle(id) {
  var r = rxById(id); if (!r) return;
  r.disabled = !r.disabled;
  rxCommit(r); render();
  toast((r.disabled ? "已关闭「" : "已开启「") + r.name + "」");
}

/* =====================================================================
   UI 骨架：CSS
   ===================================================================== */
var host = null, root = null, Q = null, QI = null;
function mount() {
  if (!pdoc.body) { setTimeout(mount, 60); return; }
  var old = pdoc.getElementById("sk-pm-host"); if (old) { try { old.remove(); } catch (e) {} }
  host = pdoc.createElement("div");
  host.id = "sk-pm-host";
  host.style.cssText = "all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000";
  pdoc.body.appendChild(host);
  try { root = host.attachShadow({ mode: "open" }); }
  catch (e) { root = host; }

  var wrap = pdoc.createElement("div");
  wrap.innerHTML = CSS() + HTML();
  root.appendChild(wrap);

  Q = function (s) { return root.querySelector(s); };
  QI = function (s) { return root.getElementById(s); };
  /* ⚠ 就算启动链中间炸了，球也必须能点、能拖、能长按弹自检 ——
     否则下一次报错还是「什么都点不动」，一点线索都拿不到 */
  try { bootUI(); }
  catch (eUI) { errSave(ownErr(eUI)); bootStepRun("球", orbInit); }
  window.__SK_PM__ = {
    host: host,
    destroy: function () { try { host.remove(); } catch (e) {} },
    mock: apiReady() ? null : mockPreset(),   /* 仅演示模式有：给预览页/测试看「预设本体」用 */
    version: VER,
    /* 给测试 / 排查用：直接驱动导出与诊断，不用模拟点击 */
    exApi: {
      set: function (t, s, m) { exType = t; if (s !== undefined && s !== null) exSel = s; if (m) exMode = m; },
      build: exBuild
    },
    probe: probeDump,
    diag: diagOpen,                                              /* 排查用：直接弹自检卡 */
    diagText: diagBuild,
    /* 我们自己的代码在文档里的行号区间 —— 用来判断一个错是不是我们的。
       测试里要伪造「我们自己的错」，就靠这个造出真实的行号。 */
    ownRange: function () { return { file: OWN_FILE, lo: OWN_LO, hi: OWN_HI }; },
    bootState: function () {
      return { step: bootStep, fail: bootFail.slice(), ok: bootOK, err: lastErr };
    },
    reorder: function (seq) { pSort = true; pReorderSeq(seq); }   /* 测试用：直接驱动拖动结果 */
  };
}

function CSS() {
  return "<style>" + `
:host{
  /* 淡口：背景几乎是纯白，金色压低饱和，阴影放散 —— 整块浮层要「贴」在页面上，不要压上去 */
  --paper:#ffffff; --paper2:#fefdfb; --paper3:#f8f5ee;
  --card:linear-gradient(168deg,#ffffff 0%,#fefcf8 54%,#fdfaf4 100%);
  --hdgrad:linear-gradient(180deg,rgba(255,255,255,.95),rgba(253,250,245,.90));
  --line:#f0ebe2; --line2:#f7f4ee;
  --ink:#2b261f; --ink2:#7b7366; --ink3:#a99e8d;
  --gold:#a8873a; --goldL:#dbc48f; --goldD:#8d6f2c;
  --goldgrad:linear-gradient(135deg,#dfc894 0%,#c9a765 55%,#b8934e 100%);
  --goldsoft:#fdf8ec; --ring:rgba(168,135,58,.20);
  --green:#4f9873; --greengrad:linear-gradient(135deg,#93cfb2 0%,#4f9873 100%);
  --graygrad:linear-gradient(135deg,#cfc9bd 0%,#a9a396 100%);
  --red:#c4695f;
  --sh:0 22px 52px rgba(90,74,48,.12),0 6px 14px rgba(90,74,48,.05);
  --shsm:0 1px 4px rgba(90,74,48,.06);
  --inssh:inset 0 1px 2px rgba(90,74,48,.06);
  --glass:linear-gradient(168deg,rgba(255,255,255,.93) 0%,rgba(254,252,248,.89) 54%,rgba(253,250,244,.86) 100%);
  --edge:rgba(255,255,255,.72); --edge2:rgba(168,135,58,.10); --hi:rgba(255,255,255,.40);
  --r:18px; --mono:"SF Mono",Menlo,Consolas,"Cascadia Mono",monospace;
}
:host(.night){
  --paper:#1a1d23; --paper2:#20242b; --paper3:#272c34;
  --card:linear-gradient(168deg,#1f232b 0%,#1c2027 54%,#1a1e25 100%);
  --hdgrad:linear-gradient(180deg,rgba(39,44,54,.92),rgba(30,34,42,.86));
  --line:#313742; --line2:#262b33;
  --ink:#e6e1d6; --ink2:#a29b90; --ink3:#7e776c;
  --gold:#cfa957; --goldL:#e4cd97; --goldD:#b98f3c;
  --goldgrad:linear-gradient(135deg,#dcbd83 0%,#c39a4a 55%,#a5842f 100%);
  --goldsoft:#221c11; --ring:rgba(207,169,87,.24);
  --green:#6dbb91; --greengrad:linear-gradient(135deg,#94d4b6,#579770 100%);
  --graygrad:linear-gradient(135deg,#5c5f66 0%,#454a52 100%);
  --red:#d9756c;
  --sh:0 22px 52px rgba(0,0,0,.44),0 6px 14px rgba(0,0,0,.22);
  --shsm:0 1px 4px rgba(0,0,0,.22);
  --inssh:inset 0 1px 2px rgba(0,0,0,.22);
  --glass:linear-gradient(168deg,rgba(33,38,47,.92) 0%,rgba(29,33,41,.90) 54%,rgba(27,31,38,.88) 100%);
  --edge:rgba(255,255,255,.09); --edge2:rgba(207,169,87,.14); --hi:rgba(255,255,255,.14);
}
/* 手机浏览器会自动放大小字（Text Autosizing），浮层会被撑爆 —— 关掉 */
.orb,.panel,.toast,.dlg{-webkit-text-size-adjust:100%;text-size-adjust:100%}
*{box-sizing:border-box}
.orb,.panel,.toast,.dlg{
  font:14px/1.6 -apple-system,"Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--ink); font-variant-numeric:tabular-nums;
}
/* ── 悬浮球 1001 ──
   默认【底边居中】：状态球占的是右下角，两个独立脚本别抢同一个位置 */
.orb{
  position:fixed; left:50%; bottom:calc(16px + env(safe-area-inset-bottom));
  width:44px;height:44px;border-radius:50%;
  background:linear-gradient(152deg,#fffefb 0%,#fdf7ec 55%,#f6ecd9 100%);
  border:1px solid rgba(168,135,58,.30);
  box-shadow:0 10px 22px rgba(90,74,48,.16),0 0 0 5px rgba(168,135,58,.06),
    inset 0 1px 0 rgba(255,255,255,.9);
  color:var(--gold); display:flex;align-items:center;justify-content:center;
  cursor:pointer; z-index:1001; touch-action:none; user-select:none;
  transition:transform .20s cubic-bezier(.34,1.4,.5,1), box-shadow .2s, border-color .2s;
}
.orb:active{transform:scale(.92)}
.orb.moved{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring),0 10px 22px rgba(90,74,48,.16),inset 0 1px 0 rgba(255,255,255,.9)}
/* 带病：脚本启动时/运行中有错 → 球自己变红环，不然「面板打不开」时一点提示都没有 */
.orb.bad{border-color:rgba(196,105,95,.55);
  box-shadow:0 0 0 3px rgba(196,105,95,.20),0 10px 22px rgba(90,74,48,.16),inset 0 1px 0 rgba(255,255,255,.9)}
.orb.bad svg{color:var(--red)}
.orb svg{width:19px;height:19px;position:relative}
.orb .pip{position:absolute;top:6px;right:6px;width:7px;height:7px;border-radius:50%;
  background:var(--red);box-shadow:0 0 0 2px var(--paper);animation:pipk 1.6s ease-in-out infinite}
@keyframes pipk{50%{opacity:.35}}
/* ── 面板 1002 ── */
.panel{
  position:fixed; z-index:1002; width:min(432px, calc(100vw - 12px));
  background:var(--glass); -webkit-backdrop-filter:blur(20px) saturate(1.45);
  backdrop-filter:blur(20px) saturate(1.45);
  border:1px solid var(--edge); box-shadow:0 0 0 1px var(--edge2), var(--sh),
    inset 0 1px 0 var(--hi);
  border-radius:var(--r);
  display:flex; flex-direction:column; overflow:hidden;
  opacity:0; transform:translateY(12px) scale(.97); pointer-events:none;
  transition:opacity .2s ease, transform .22s cubic-bezier(.3,1.2,.5,1);
}
.panel.open{opacity:1;transform:none;pointer-events:auto}
.hd{
  display:flex;align-items:center;gap:7px;padding:9px 11px;flex:none;
  border-bottom:1px solid var(--line2); background:var(--hdgrad);
  cursor:move; touch-action:none; position:relative;
}
.hd::after{
  content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(168,135,58,.34),transparent);
}
.hd .dot{width:7px;height:7px;border-radius:50%;background:var(--goldgrad);flex:none;box-shadow:0 0 0 3px var(--goldsoft)}
.hd .nm{font-size:10.5px;color:var(--ink3);flex:0 1 104px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hd .grow{flex:1}
/* ── 预设切换小框 ──
   不用酒馆自己的预设界面，直接在这个脚本里点一下就列出全部预设。
   位置：预设名右边。窄屏时预设名会被藏掉（.hd .nm{display:none}），
   那时按钮自己带上当前预设名，不然就不知道自己在哪个预设里。 */
/* ★ 纯图标小按钮（用户实测：带名字太长，把关闭按钮挤没了） */
.psw{
  flex:none;width:27px;height:27px;padding:0;border-radius:9px;
  border:1px solid var(--line);background:var(--paper);color:var(--ink3);
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  transition:.18s;box-shadow:var(--shsm);
}
.psw:hover{color:#fff;border-color:transparent;background:var(--goldgrad);box-shadow:0 2px 8px var(--ring)}
.psw svg{width:14px;height:14px}
/* 预设切换列表：摆在弹窗（.dlg .dm）里。
   弹窗本身宽度 min(320px, 100vw-40px)，列表给它一个内滚区，预设再多也撑不爆屏幕 */
.dlg .plist{max-height:46vh;overflow-y:auto;overscroll-behavior:contain;margin:0 -4px}
.dlg .pi{
  display:flex;align-items:center;gap:7px;width:100%;text-align:left;
  padding:9px 10px;border-radius:9px;border:0;background:transparent;
  color:var(--ink);font-family:inherit;font-size:12.5px;cursor:pointer;transition:.15s;
}
.dlg .pi:hover{background:var(--goldsoft)}
.dlg .pi.on{background:var(--goldsoft);color:var(--goldD);font-weight:700}
.dlg .pi .ck{width:13px;height:13px;flex:none;color:var(--gold)}
.dlg .pi .nm2{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dlg .ph{font-size:10px;color:var(--ink3);padding:6px 9px 4px;letter-spacing:.4px}
.ico{
  width:27px;height:27px;flex:none;border-radius:9px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink2);display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:.18s;box-shadow:var(--shsm);
}
.ico:hover,.ico.on{color:#fff;border-color:transparent;background:var(--goldgrad);box-shadow:0 2px 8px var(--ring)}
.ico svg{width:14px;height:14px}
/* 三个大页签放在顶上：底下一整条 tab bar 就全省给条目了 */
.nav{display:flex;gap:3px;padding:3px;border-radius:11px;background:var(--paper3);box-shadow:var(--inssh);flex:none}
.nav button{
  border:0;background:transparent;color:var(--ink2);padding:4px 11px;font-size:12px;
  cursor:pointer;font-family:inherit;border-radius:8px;line-height:1.5;transition:.18s;letter-spacing:.2px;
}
.nav button:hover{color:var(--ink)}
.nav button.on{
  color:#fff;font-weight:700;background:var(--goldgrad);
  box-shadow:0 2px 8px var(--ring);
}
/* 统计：一行半，剩下的竖直长度全留给条目 */
.stat{
  padding:9px 12px 10px;flex:none;border-bottom:1px solid var(--line2);
  background:
    radial-gradient(120% 130% at 12% -30%,rgba(223,200,148,.15),rgba(223,200,148,0) 62%),
    linear-gradient(180deg,var(--goldsoft),rgba(253,251,247,0));
  display:flex;align-items:center;gap:8px;flex-wrap:wrap;
}
.stat .lb{flex:1 0 100%;font-size:10px;color:var(--ink3);letter-spacing:.6px;line-height:1.35}
.stat .num{
  font-family:var(--mono);font-size:23px;font-weight:800;line-height:1.1;
  letter-spacing:-.6px;flex:none;cursor:pointer;user-select:none;
  background:var(--goldgrad);-webkit-background-clip:text;background-clip:text;color:transparent;
}
.stat .num u{
  font-size:11px;font-weight:700;text-decoration:none;letter-spacing:0;
  -webkit-text-fill-color:var(--ink3);color:var(--ink3);margin-left:3px;
}
.stat .r2{font-size:11px;color:var(--ink2);flex:none;white-space:nowrap}
.stat .r2 b{font-family:var(--mono);color:var(--ink);font-weight:700}
.stat .grow{flex:1 1 0;min-width:0}
.tabs{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;flex:none;background:var(--paper)}
.tabs button{border:0;background:var(--paper);color:var(--ink2);padding:3px 8px;font-size:11px;cursor:pointer;font-family:inherit;line-height:1.5}
.tabs button+button{border-left:1px solid var(--line)}
.tabs button.on{background:var(--goldgrad);color:#fff;font-weight:700}
@keyframes bump{0%{transform:scale(1)}38%{transform:scale(1.09)}100%{transform:scale(1)}}
.num.bump{animation:bump .34s cubic-bezier(.34,1.4,.5,1)}
/* ── 搜索：默认收着，点放大镜才展开（头部那点地方不能白占一行） ── */
.find{display:none;padding:7px 12px;flex:none;align-items:center;gap:7px;border-bottom:1px solid var(--line2);background:var(--paper2)}
.find.on{display:flex}
.find .fg{width:15px;height:15px;flex:none;color:var(--ink3);display:flex;align-items:center;justify-content:center}
.find .fg svg{width:15px;height:15px;display:block}
.find input{
  flex:1;min-width:0;padding:6px 10px;border-radius:9px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink);font:12.5px/1.5 inherit;outline:none;transition:.16s;
}
.find input:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.find .fn{font-family:var(--mono);font-size:10.5px;color:var(--ink3);flex:none;white-space:nowrap}
.find .fx{width:22px;height:22px;flex:none;border-radius:7px;display:flex;align-items:center;justify-content:center;
  color:var(--ink3);cursor:pointer;transition:.16s}
.find .fx svg{width:12px;height:12px;display:block}
.find .fx:hover{background:var(--goldgrad);color:#fff}
/* 命中的字：底下垫一道浅黄，比整块反色素净 */
mark{background:linear-gradient(180deg,transparent 58%,rgba(223,200,148,.62) 58%);color:inherit;border-radius:2px;padding:0 .5px}
/* 跨书搜出来的条目：书名得先看见，不然不知道这条是哪本书里的 */
.entrow .t1 .bk{font-weight:400;color:var(--ink3);font-size:11px;margin-right:2px}
.entrow .t1 .sep{font-style:normal;color:var(--line);margin:0 3px}
@keyframes flashRow{0%{background:var(--goldsoft)}100%{background:transparent}}
.entrow.flash{animation:flashRow 1.1s ease}
/* 搜索没结果：把关键词也说出来，省得怀疑是不是没输进去 */
.nohit{padding:26px 16px;text-align:center;color:var(--ink3);font-size:12px;line-height:1.9}
.nohit b{color:var(--ink2);font-weight:600}
/* 方案条 */
/* 方案条（已废弃方案功能，留此行防漏改） */
.chip{
  flex:none;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;
  padding:3.5px 10px;border-radius:99px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink2);font-size:11px;cursor:pointer;line-height:1.6;transition:.16s;
}
.chip:hover{border-color:var(--gold);color:var(--gold);background:var(--goldsoft)}
.chip.add{border-style:dashed}
.chip .x{font-style:normal;font-size:13px;color:var(--ink3);line-height:1;margin-left:1px}
.chip .x:hover{color:var(--red)}
.chip.cur{border-color:transparent;background:var(--goldgrad);color:#fff;font-weight:700;box-shadow:0 2px 8px var(--ring)}
/* ── 列表 ── */
.list{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:5px 0 8px}
.list::-webkit-scrollbar{width:8px}
.list::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--line),var(--line2));border-radius:4px;border:2px solid transparent;background-clip:padding-box}
.row{display:flex;align-items:center;gap:8px;padding:9px 13px;border-bottom:1px solid var(--line2);position:relative;transition:background .16s}
.row:hover{background:linear-gradient(90deg,rgba(253,248,236,.5),transparent)}
.row.off .nm{color:var(--ink3);text-decoration:line-through;text-decoration-thickness:1px}
.row.open-ed .op{color:#fff;border-color:transparent;background:var(--goldgrad)}
.row .sw{
  width:36px;height:20px;border-radius:11px;flex:none;position:relative;cursor:pointer;
  background:var(--paper3);border:1px solid var(--line);box-shadow:var(--inssh);transition:.2s;
}
.row .sw::after{
  content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
  background:#fff;box-shadow:0 1px 3px rgba(60,48,30,.28);transition:.2s cubic-bezier(.34,1.4,.5,1);
}
.row .sw.on{background:var(--goldgrad);border-color:transparent;box-shadow:0 2px 8px var(--ring)}
.row .sw.on::after{transform:translateX(15px)}
.row .nm{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .cc{font-family:var(--mono);font-size:10.5px;color:var(--ink3);flex:none;min-width:52px;text-align:right}
.row .op{width:27px;height:27px;flex:none;border-radius:8px;border:1px solid transparent;
  background:transparent;color:var(--ink3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.16s}
.row .op:hover{color:#fff;border-color:transparent;background:var(--goldgrad);box-shadow:0 2px 8px var(--ring)}
.row .op svg{width:14px;height:14px}
.row .ratio{position:absolute;left:13px;right:13px;bottom:2px;height:2px;border-radius:2px;background:var(--line2);overflow:hidden}
.row .ratio i{display:block;height:100%;border-radius:2px;background:var(--goldgrad)}
.row.locked .sw{opacity:.4}
/* 搜索时的「正文摘要」副行：名字没命中、正文命中了才给，告诉你它命在哪 */
.row.sub{padding:0 13px 8px 13px;margin-top:-7px;border-bottom:1px solid var(--line2);pointer-events:none}
.row.sub:hover{background:transparent}
.row.sub .nm{font-size:11px;color:var(--ink3);font-family:var(--mono);line-height:1.55}
@keyframes rowIn{from{opacity:0;transform:translateY(4px)}}
.row.in{animation:rowIn .26s ease backwards}
@keyframes flashRow{0%{background:var(--goldsoft)}100%{background:transparent}}
.row.flash{animation:flashRow 1s ease}
.macros{display:flex;align-items:center;gap:6px;margin-top:9px;flex-wrap:wrap}
.macros .chip{font-family:var(--mono);font-size:11.5px;padding:5px 11px}
.macros .chip u{font-size:10px;color:var(--ink3);text-decoration:none;margin-left:4px}
.macros .chip:hover u{color:inherit}
.rl{display:flex;align-items:center;gap:7px;margin-top:10px;flex-wrap:wrap}
.rl .cnt{font-family:var(--mono);font-size:11px;color:var(--ink3)}
.rl .grow{flex:1}
.rl select{padding:5px 8px;border-radius:9px;border:1px solid var(--line);background:var(--paper);
  color:var(--ink2);font-size:11.5px;font-family:inherit;outline:none}
.btn{padding:7px 13px;border-radius:10px;border:1px solid var(--line);background:var(--paper);
  color:var(--ink2);font-size:12px;cursor:pointer;font-family:inherit;transition:.16s}
.btn:hover{border-color:var(--gold);color:var(--gold)}
.btn.go{background:var(--goldgrad);border-color:transparent;color:#fff;font-weight:700;box-shadow:0 3px 10px var(--ring)}
.btn.sm{padding:5px 10px;font-size:11.5px;border-radius:9px}
/* 破坏性操作：不做成主按钮 —— 手滑点在「确定」上时不能是不可逆的 */
.btn.danger{display:none;color:#b3453f;border-color:#e8cfcb;background:#fdf6f5;font-weight:600}
.btn.danger.on{display:inline-block}
.btn.danger:hover{border-color:var(--red);color:var(--red)}
/* ── 折叠容器：自定义分组 / 世界书 / 正则组 全用它 ── */
.grp{flex:none;border-bottom:1px solid var(--line2)}
.ghead{display:flex;align-items:center;gap:8px;padding:10px 13px;cursor:pointer;user-select:none;transition:.16s;
  background:linear-gradient(90deg,rgba(253,248,236,.34),transparent)}
.ghead:hover{background:linear-gradient(90deg,rgba(253,248,236,.78),transparent)}
.ghead .cv{width:13px;height:13px;flex:none;color:var(--ink3);transition:transform .2s,color .2s}
.ghead .cv svg{width:13px;height:13px;display:block}
/* ⚠ 必须用直接子选择器：分组里套着书、书里套着条目，写成 .grp.open .xxx
   会让「父分组一展开，子容器全被连带展开」——当时就是这么翻车的 */
.grp.open>.ghead .cv{transform:rotate(90deg);color:var(--gold)}
.ghead .gn{flex:1;min-width:0;font-size:12.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.2px}
.ghead .gn i{font-style:normal;color:var(--ink3);font-weight:400;font-size:11px;margin-left:5px}
.ghead .gnum{
  font-family:var(--mono);font-size:10.5px;color:var(--ink2);flex:none;
  padding:1.5px 7px;border-radius:7px;background:var(--paper3);border:1px solid var(--line);
}
.ghead .gnum b{color:var(--gold)}
.gbody{display:none}
/* 只管自己这一层：不然父容器一展开，里面所有层跟着全开 */
.grp.open>.gbody{display:block}
.tag{
  flex:none;font-size:9.5px;letter-spacing:.4px;padding:2px 6px;border-radius:6px;
  background:var(--paper3);color:var(--ink3);border:1px solid var(--line);font-weight:600;
}
.tag.chat{background:linear-gradient(135deg,#e9dcf3,#dccbf0);color:#70528c;border-color:transparent}
.tag.character{background:linear-gradient(135deg,#ddebf7,#cbe0f2);color:#47759a;border-color:transparent}
.tag.global{background:linear-gradient(135deg,#e4ecdf,#d2e5cd);color:#4c7a46;border-color:transparent}
/* 书行：一行就是一本书。点书名 → 进这本书的条目界面（条目不在这儿展开） */
.brow{display:flex;align-items:center;gap:7px;padding:9px 13px;border-bottom:1px solid var(--line2);position:relative;transition:background .16s}
.brow:hover{background:linear-gradient(90deg,rgba(253,248,236,.55),transparent)}
.brow .star{width:18px;height:18px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--line);cursor:pointer;transition:.16s}
.brow .star svg{width:13px;height:13px}
.brow .star:hover{color:var(--goldL)}
.brow .star.on{color:var(--gold)}
.brow .bn{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.brow:hover .bn{color:var(--gold)}
.brow.dis .bn{color:var(--ink3)}
.brow .bc{font-family:var(--mono);font-size:10px;color:var(--ink3);flex:none}
.brow .into{width:16px;height:16px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--line);cursor:pointer;transition:.16s}
.brow .into svg{width:13px;height:13px;display:block}
.brow:hover .into{color:var(--goldL)}
.brow .sw{width:32px;height:18px;border-radius:10px;flex:none;position:relative;cursor:pointer;background:var(--paper3);border:1px solid var(--line);transition:.2s}
.brow .sw::after{content:"";position:absolute;top:1.5px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(60,48,30,.22);transition:.2s}
.brow .sw.on{background:var(--goldgrad);border-color:transparent}
.brow .sw.on::after{transform:translateX(13px)}
.brow .sw.unk{opacity:.35}
/* 二级：某一本书的条目界面。书名条钉在顶上，滚多远都看得出在看哪本 */
.bhd{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;padding:9px 13px;
  background:var(--paper2);border-bottom:1px solid var(--line2)}
.icox{width:28px;height:28px;flex:none;border-radius:9px;display:flex;align-items:center;justify-content:center;
  color:var(--ink2);cursor:pointer;transition:.16s}
.icox:hover{background:var(--goldgrad);color:#fff}
.icox svg{width:15px;height:15px;display:block}
.bhd .bnm{flex:1;min-width:0;font-size:13px;font-weight:700;letter-spacing:.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bhd .bc{font-family:var(--mono);font-size:10.5px;color:var(--ink3);flex:none}
.bhd .sw{width:32px;height:18px;border-radius:10px;flex:none;position:relative;cursor:pointer;background:var(--paper3);border:1px solid var(--line);transition:.2s}
.bhd .sw::after{content:"";position:absolute;top:1.5px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(60,48,30,.22);transition:.2s}
.bhd .sw.on{background:var(--goldgrad);border-color:transparent}
.bhd .sw.on::after{transform:translateX(13px)}
.bhd .sw.unk{opacity:.35}
.warn{
  margin:9px 13px 4px;padding:7px 10px;border-radius:10px;font-size:11px;line-height:1.5;
  background:linear-gradient(135deg,rgba(212,178,102,.13),rgba(212,178,102,.05));
  border:1px solid rgba(168,135,58,.20);color:var(--goldD);
}
.wtool{display:flex;align-items:center;gap:6px;padding:8px 13px 9px;flex-wrap:wrap}
.wtool .grow{flex:1}
.wtool .lbl{font-size:10.5px;color:var(--ink3);flex:none}
/* 条目行（世界书 / 正则 共用） */
.entrow{display:flex;align-items:center;gap:7px;padding:7px 13px;border-bottom:1px solid var(--line2);position:relative}
.entrow:hover{background:linear-gradient(90deg,rgba(253,248,236,.5),transparent)}
.entrow.dis .t1{color:var(--ink3)}
.entrow .tri{display:flex;padding:2px;border-radius:8px;background:var(--paper3);box-shadow:var(--inssh);flex:none}
.entrow .tri button{
  border:0;background:transparent;color:var(--ink3);font-size:10px;padding:2.5px 6px;
  border-radius:6px;cursor:pointer;font-family:inherit;line-height:1.4;letter-spacing:.2px;transition:.16s;
}
.entrow .tri button:hover{color:var(--ink)}
.entrow .tri button.on{color:#fff;font-weight:700}
.entrow .tri button.on[data-t="key"]{background:var(--greengrad);box-shadow:0 2px 6px rgba(63,143,104,.30)}
.entrow .tri button.on[data-t="always"]{background:var(--goldgrad);box-shadow:0 2px 6px var(--ring)}
.entrow .tri button.on[data-t="off"]{background:var(--graygrad);box-shadow:0 2px 6px rgba(90,84,72,.25)}
.entrow .tx{flex:1;min-width:0;cursor:pointer}
.entrow .t1{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entrow .t2{font-size:10px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px}
.entrow .t2 em{font-style:normal;font-family:var(--mono);color:var(--gold);padding:0 2px}
.entrow .cc{font-family:var(--mono);font-size:10px;color:var(--ink3);flex:none}
/* 正则行 */
.rxrow{padding:8px 13px 8px 20px;border-bottom:1px solid var(--line2);transition:background .16s}
.rxrow:hover{background:linear-gradient(90deg,rgba(253,248,236,.5),transparent)}
.rxrow.dis .rxn{color:var(--ink3)}
.rxrow .l1{display:flex;align-items:center;gap:7px}
.rxrow .rxn{flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.rxrow:hover .rxn{color:var(--gold)}
.rxrow .l2{display:flex;gap:6px;margin-top:4px;font-family:var(--mono);font-size:10px;color:var(--ink3);padding-left:43px}
.rxrow .l2 span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46%}
.empty{padding:30px 16px;text-align:center;color:var(--ink3);font-size:12px;line-height:1.8}
/* 底栏 */
.ft{flex:none;padding:8px 12px;border-top:1px solid var(--line2);background:var(--hdgrad);
  display:flex;align-items:center;gap:8px}
.ft .st{font-size:11px;color:var(--ink2);display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden}
.ft .st .led{width:7px;height:7px;border-radius:50%;background:var(--greengrad);flex:none}
.ft .st.busy .led{background:var(--goldgrad);animation:blink .7s infinite}
.ft .st.err .led{background:var(--red)}
.ft .st span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ft .how{font-size:10px;color:var(--ink3);flex:none;white-space:nowrap}
@keyframes blink{50%{opacity:.3}}
/* ★ 层级总表 —— 改这里之前先读一遍
   悬浮球 1001 ＜ 面板 1002 ＜ 全屏编辑页 1100 ＜ 遮罩 1200 ＜ 弹窗 1201 ＜ toast 1300
   教训回放：早先把遮罩压在球下面（900 < 1001），结果弹窗一开球被整块盖死；
   这回是弹窗 901 掉到面板 1002 / 编辑页后面 —— 一律按上面这张表排。 */
.mask{position:fixed;inset:0;background:rgba(24,18,10,.30);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  opacity:0;pointer-events:none;transition:.2s;z-index:1200}
.mask.on{opacity:1;pointer-events:auto}
.dlg{
  position:fixed;left:50%;top:50%;transform:translate(-50%,-46%) scale(.96);z-index:1201;
  width:min(320px,calc(100vw - 40px));background:var(--card);border:1px solid var(--edge);
  box-shadow:0 0 0 1px var(--edge2),var(--sh),inset 0 1px 0 var(--hi);
  border-radius:18px;padding:16px 16px 14px;
  opacity:0;pointer-events:none;transition:.2s;
}
.dlg.on{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
.dlg .dt{font-size:13.5px;font-weight:700;margin-bottom:7px;letter-spacing:.2px}
.dlg .dm{font-size:12px;color:var(--ink2);line-height:1.7}
/* 自检卡里的原始信息：等宽、可滚、能整段选中复制 */
.dlg .dm pre{margin:8px 0 0;padding:9px 10px;white-space:pre-wrap;word-break:break-all;
  font:11px/1.65 var(--mono);color:var(--ink);background:var(--paper3);
  border:1px solid var(--line);border-radius:10px;max-height:46vh;overflow:auto;
  -webkit-user-select:text;user-select:text;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.dlg .db{display:flex;gap:8px;margin-top:14px}
.dlg .db .btn{flex:1}
/* ── 全屏编辑页 1100 ──
   手机上软键盘一弹，面板里那点行内小编辑框就被挤成一条缝 —— 编辑统一走这一整屏。
   顺序照你要的：**最上面是正文**，名字 / 角色 / 关键词钉在最底下（键盘上沿）。
   ⚠ 高度绝不用 vh / inset:0 —— 那量的是「地址栏收起时」的尺寸，比此刻可见的大。
      一律由视觉视口实测写死（sheetFit），键盘多高它都贴着键盘上沿。 */
.sheet{position:fixed;left:0;top:0;width:100%;height:100%;z-index:1100;display:none;
  flex-direction:column;overflow:hidden;background:var(--paper);
  border-top:1px solid var(--edge);
  font:14px/1.6 -apple-system,"Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif;
  color:var(--ink);-webkit-text-size-adjust:100%;text-size-adjust:100%;
  box-shadow:0 -8px 30px rgba(90,74,48,.10)}
.sheet.on{display:flex}
.shd{display:flex;align-items:center;gap:8px;flex:none;padding:9px 11px;
  padding-top:calc(9px + env(safe-area-inset-top));
  border-bottom:1px solid var(--line2);background:var(--hdgrad)}
.shd .back{width:36px;height:36px;flex:none;border-radius:11px;display:flex;align-items:center;
  justify-content:center;color:var(--ink2);cursor:pointer;background:var(--paper2);
  border:1px solid var(--line)}
.shd .back svg{width:17px;height:17px}
.shd .back:active{background:var(--paper3)}
.shd .tit{flex:1;min-width:0;font-size:12.5px;color:var(--ink2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.shd .ok{flex:none;padding:8px 16px;border-radius:11px;border:1px solid transparent;
  background:var(--goldgrad);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;
  box-shadow:0 2px 8px var(--ring),inset 0 1px 0 var(--hi)}
.shd .ok:active{transform:scale(.96)}
/* 正文区：占掉全部剩余高度，自己滚 —— 名字那一栏永远不被它挤走 */
.sarea{flex:1;min-height:0;padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px}
/* 正文框：用户 10-27 反馈太小 → min-height 110 加大到 170（全屏页剩的高度全是它的） */
.sarea textarea{flex:1;width:100%;min-height:170px;resize:none;outline:none;
  padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--paper2);
  color:var(--ink);font:13px/1.8 var(--mono);-webkit-text-size-adjust:100%}
.sarea textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.sarea textarea.half{flex:none;height:96px;min-height:70px}
.slb{font-size:10.5px;color:var(--ink3);letter-spacing:.5px;flex:none}
/* 底栏：名字 / 角色 / 关键词 / 计数 —— 钉死在键盘上沿 */
.sft{flex:none;padding:9px 12px calc(9px + env(safe-area-inset-bottom));
  border-top:1px solid var(--line2);background:var(--paper2);
  display:flex;flex-direction:column;gap:7px}
.srow{display:flex;align-items:center;gap:8px}
.srow>.lb{flex:none;width:34px;font-size:10.5px;color:var(--ink3)}
.sft input,.sft select{flex:1;min-width:0;padding:9px 11px;border-radius:11px;
  border:1px solid var(--line);background:var(--paper);color:var(--ink);
  font-size:13px;font-family:inherit;outline:none}
.sft input:focus,.sft select:focus{border-color:var(--gold)}
.sft select{flex:none;width:104px;cursor:pointer}
.sft input.multiline{min-width:0;flex:1}
.smeta{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--ink3)}
.smeta .grow{flex:1}
.stok{color:var(--goldD);font-weight:600}
/* 全屏编辑页里的三档按钮（跟世界书行里那套同款，这里是 data-tr 不是 data-t） */
.sft .tri{display:flex;padding:2px;border-radius:9px;background:var(--paper3);
  box-shadow:var(--inssh);flex:none}
.sft .tri button{padding:6px 12px;border-radius:7px;border:none;background:transparent;
  color:var(--ink3);font:600 11.5px inherit;cursor:pointer;transition:.16s}
.sft .tri button:active{transform:scale(.95)}
.sft .tri button.on{color:#fff;font-weight:700}
.sft .tri button.on[data-tr="key"]{background:var(--greengrad);box-shadow:0 2px 6px rgba(63,143,104,.30)}
.sft .tri button.on[data-tr="always"]{background:var(--goldgrad);box-shadow:0 2px 6px var(--ring)}
.sft .tri button.on[data-tr="off"]{background:var(--graygrad);box-shadow:0 2px 6px rgba(90,84,72,.25)}
/* 正在全屏编辑的那一条：底下留一道浅金提示（这条不算 .row，别处统计条目数时会数错） */
.edmark{padding:7px 13px;font-size:10.5px;color:var(--goldD);background:var(--goldsoft);
  border-left:3px solid var(--gold);border-radius:0 8px 8px 0;margin:0 0 0 0}
/* 报错条：脚本自己崩了也要在界面上留句话，点一下就能复制给 AI */
.errbar{display:flex;align-items:center;gap:8px;margin:8px 10px 0;padding:9px 11px;border-radius:11px;
  border:1px solid rgba(196,105,95,.42);background:rgba(196,105,95,.10);
  color:var(--red);cursor:pointer;font-size:11.5px;line-height:1.5}
.errbar svg{width:13px;height:13px;flex:none}
.errbar b{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.errbar .x{flex:none;font-size:11px;color:var(--ink3)}
/* toast 1300 */
.toast{
  position:fixed;left:50%;bottom:calc(72px + env(safe-area-inset-bottom));z-index:1300;
  transform:translateX(-50%) translateY(8px);padding:9px 15px;border-radius:12px;
  background:linear-gradient(135deg,#2f2a22,#221d17);color:#fdf8ee;font-size:12px;
  border:1px solid rgba(223,200,148,.28);box-shadow:0 12px 28px rgba(0,0,0,.28),
    inset 0 1px 0 rgba(255,255,255,.10);
  opacity:0;pointer-events:none;transition:.24s cubic-bezier(.3,1.2,.5,1);
  max-width:78vw;text-align:center;letter-spacing:.2px;
}
.toast.on{opacity:.97;transform:translateX(-50%)}
/* 珐琅光泽：所有金色实心控件的顶上加一道内高光，整块看着像上过釉 */
/* ── 预设底部工具行：在条目最底下，「已同步」栏之上 ── */
.ltools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 13px 12px;border-top:1px dashed var(--line)}
.ltools .chip{font-size:11.5px;padding:5px 12px}
.ltools .chip svg{width:12px;height:12px}
.chip.go2{border-color:transparent;background:var(--goldgrad);color:#fff;font-weight:700}
/* 排序模式的上下钮 */
/* 分组模式：条目左边的收录框 */
.row .pkbox{width:20px;height:20px;flex:none;border-radius:6px;border:1.5px solid var(--line);
  background:var(--paper);display:flex;align-items:center;justify-content:center;cursor:pointer;
  color:#fff;transition:.16s}
.row .pkbox:hover{border-color:var(--gold)}
.row .pkbox.on{border-color:transparent;background:var(--goldgrad)}
.row .pkbox svg{width:12px;height:12px;display:block}
.row .gtag{flex:none;font-size:10px;color:var(--goldD);background:var(--goldsoft);
  border:1px solid rgba(168,135,58,.22);border-radius:7px;padding:2px 7px;max-width:76px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 占位提示词（插入位置）：没有正文、也不给编辑 */
.row .nm.ph{color:var(--ink3)}
.row .phtag{flex:none;font-style:normal;font-size:9.5px;color:var(--ink3);
  border:1px solid var(--line2);border-radius:6px;padding:1px 5px;margin-left:6px;opacity:.85}
/* 「没加进模板的条目」那几行 —— 不用 .row，免得被当成条目数 */
.unrow{display:flex;align-items:center;gap:6px;padding:5px 11px 5px 30px;
  font-size:12.5px;color:var(--ink3);border-bottom:1px solid var(--line2)}
.unrow .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 排序模式：拖动把手 */
.row .grip{width:24px;height:24px;flex:none;border-radius:7px;color:var(--ink3);cursor:grab;
  display:flex;align-items:center;justify-content:center;touch-action:none;transition:.16s}
.row .grip:hover{color:var(--gold);background:var(--goldsoft)}
.row .grip svg{width:14px;height:14px;display:block;pointer-events:none}
.row.dragging{opacity:.92;background:var(--goldsoft);box-shadow:0 8px 22px rgba(90,74,48,.20);
  border-radius:10px;position:relative;z-index:2}
/* 收录弹框 */
.picklist{display:flex;flex-direction:column;gap:6px;margin:2px 0 4px}
.gin{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;
  border-radius:10px;border:1px solid var(--line);background:var(--paper);cursor:pointer;
  font-family:inherit;font-size:12.5px;color:var(--ink);transition:.16s;text-align:left}
.gin:hover{border-color:var(--gold);background:var(--goldsoft)}
.gin b{font-weight:600}
.gin i{font-style:normal;font-size:10.5px;color:var(--ink3)}
.ginnew{display:flex;gap:6px;margin-top:2px}
.ginnew input{flex:1;min-width:0;padding:8px 10px;border-radius:10px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink);font-size:12.5px;font-family:inherit;outline:none}
.ginnew input:focus{border-color:var(--gold)}
/* ── 导出页（淡雅卡片式：左侧小圆点，选中才微微描金） ── */
.exwrap{padding:14px 16px 20px;display:flex;flex-direction:column;gap:8px}
.exlb1{font-size:10px;color:var(--ink3);letter-spacing:.6px;margin-top:3px}
.exseg{display:flex;gap:6px;flex-wrap:wrap}
.exb{flex:1;min-width:72px;display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:11px;
  border:1px solid var(--line);background:var(--paper);color:var(--ink2);font-size:12.5px;
  cursor:pointer;font-family:inherit;transition:.16s;text-align:left}
.exb .dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--paper3);
  border:1.5px solid var(--line);transition:.16s}
.exb:hover{border-color:var(--gold)}
.exb.on{border-color:var(--gold);background:var(--goldsoft);color:var(--goldD);font-weight:600}
.exb.on .dot{background:var(--gold);border-color:var(--gold)}
.exrow{display:flex}
select.exsel{flex:1;padding:9px 11px;border-radius:11px;border:1px solid var(--line);background:var(--paper);
  color:var(--ink);font-size:13px;font-family:inherit;outline:none}
.exgo{margin-top:8px;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;
  font-size:13px;border-radius:12px}
.exgo svg{width:14px;height:14px}
.exhint{font-size:10.5px;color:var(--ink3);line-height:1.7;margin-top:2px}
textarea.excp{width:100%;min-height:120px;max-height:40vh;margin-top:8px;padding:9px;border-radius:10px;
  border:1px solid var(--line);background:var(--paper);color:var(--ink);font:11px/1.6 var(--mono);resize:vertical}.nav button.on,.tabs button.on,.ico:hover,.ico.on,.btn.go,.chip.cur,
.row.open-ed .op,.row .op:hover,.row .sw.on,.find .fx:hover{
  box-shadow:0 2px 8px var(--ring),inset 0 1px 0 var(--hi) !important;
}
/* 滚动条描金：细一点、淡一点，跟主题走 */
.list::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(223,200,148,.50),rgba(184,147,78,.32));border-radius:4px;border:2px solid transparent;background-clip:padding-box}
@media (max-width:430px){
  .stat .num{font-size:20px} .stat .r2{font-size:10.5px} .row .cc{min-width:44px}
  .hd .nm{display:none}                 /* 窄屏优先把「当前预设名」让给按钮 */
  .entrow{padding-left:11px} .brow{padding-left:11px} .rxrow{padding-left:16px}
  .rxrow .l2{padding-left:39px}
}
` + "</style>";
}

/* =====================================================================
   UI 骨架：HTML
   ===================================================================== */
var SV = {
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  updown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 17l-3-3 3-3M8 14V4M16 7l3 3-3 3M16 10v10"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M6 10l6 6 6-6M5 20h14"/></svg>',
  night: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>',
  /* 切换预设：两个来回的箭头 */
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5"/></svg>'
};
function ico(id, title, cls) {
  return '<span class="ico' + (cls ? " " + cls : "") + '" id="' + id + '" title="' + (title || "") + '">' + (SV[id] || "") + "</span>";
}

function HTML() {
  return "" +
  '<div class="orb" id="orb" title="' + APP + '">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' +
    '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/>' +
    '<circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>' +
  '</div>' +
  '<div class="panel" id="panel">' +
    '<div class="hd" id="head">' +
      '<i class="dot"></i>' +
      '<span class="nav" id="nav">' +
        '<button data-v="preset" class="on">预设</button>' +
        '<button data-v="world">世界书</button>' +
        '<button data-v="regex">正则</button>' +
        '<button data-v="export">导出</button>' +
      '</span>' +
      '<span class="nm" id="pname"></span>'
      +       '<button class="psw" id="pSwap" title="切换酒馆预设">' + SV.swap + '</button>'
      + '<span class="grow"></span>' +
      '<span class="ico" id="pFind" title="搜索：条目名 / 内容">' + SV.find + '</span>' +
      '<span class="ico" id="pNight" title="夜间 / 日间">' + SV.night + '</span>' +
      '<span class="ico" id="pClose" title="收起">' + SV.close + '</span>' +
    '</div>' +
    '<div class="stat">' +
      '<div class="lb" id="lb">实际发给 AI 的量 · 只统计开启的条目</div>' +
      '<div class="num" id="total" title="点一下看这里最占 token 的 3 条">0<u>tok</u></div>' +
      '<span class="r2" id="r2"></span>' +
      '<span class="grow"></span>' +
      '<div class="tabs" id="tabs">' +
        '<button data-t="all" class="on">全部</button><button data-t="on">已开</button><button data-t="off">已关</button>' +
      '</div>' +
    '</div>' +
    '<div class="find" id="find">'
      + '<i class="fg">' + SV.find + '</i>'
      + '<input id="finp" spellcheck="false" placeholder="搜条目名 / 内容">'
      + '<span class="fn" id="fnum"></span>'
      + '<span class="fx" id="fclear" title="清空">' + SV.close + '</span>'
      + '</div>' +
    '<div class="list" id="list"></div>' +
    '<div class="ft">' +
      '<div class="st" id="sync"><i class="led"></i><span id="syncTx">已同步</span></div>' +
      '<span class="how" id="how"></span>' +
    '</div>' +
  '</div>' +
  /* 全屏编辑页：默认藏着，点条目进到这里才睁开（z 1100，盖在面板上） */
  '<div class="sheet" id="sheet"></div>' +
  '<div class="mask" id="mask"></div>' +
  '<div class="dlg" id="dlg"><div class="dt" id="dlgT"></div><div class="dm" id="dlgM"></div>' +
    '<div class="db"><button class="btn" id="dlgNo">取消</button><button class="btn danger" id="dlgRisk"></button><button class="btn go" id="dlgYes">确定</button></div></div>' +
  '<div class="toast" id="toast"></div>';
}

/* =====================================================================
   可视区：手机上 vh / inset:0 全是骗人的（量的是地址栏收起时的尺寸），
   一律用 visualViewport 实测 —— 「悬浮球不见了」多半就是这里算错
   ===================================================================== */
function vpWin() { return pwin; }
function vpRect() {
  var W = vpWin();
  try {
    var vv = W.visualViewport;
    if (vv && vv.height > 0) {
      return { w: Math.round(vv.width), h: Math.round(vv.height),
               top: Math.round(vv.offsetTop || 0), left: Math.round(vv.offsetLeft || 0) };
    }
  } catch (e) {}
  return { w: W.innerWidth || 0, h: W.innerHeight || 0, top: 0, left: 0 };
}
function orbPlace(el, x, y, edge) {
  el.style.left = x + "px"; el.style.top = y + "px";
  el.style.right = "auto"; el.style.bottom = "auto";
  lsSet("pos", Math.round(x) + "," + Math.round(y));
  if (edge !== undefined) lsSet("edge", edge || "");
}
/* 默认位：屏幕底边居中。以前钉在左下角，但手机上够不着 */
function orbCenterBottom(el) {
  var R = vpRect();
  if (!R.h) return;
  var w = el.offsetWidth || 44, h = el.offsetHeight || 44;
  if (!w || !h) return;
  var x = Math.round(R.left + R.w / 2 - w / 2);
  var y = Math.round(R.top + R.h - h - 14);
  orbPlace(el, Math.max(R.left + 4, x), Math.max(R.top + 4, y), "c");
}
/* 把跑出屏幕的球拽回来：键盘弹出、地址栏收放、转屏都会让它跑丢 */
function orbClamp() {
  var el = QI("orb"); if (!el) return;
  var R = vpRect(); if (!R.h) return;
  var w = el.offsetWidth || 44, h = el.offsetHeight || 44;
  var L = parseFloat(el.style.left || ""), T = parseFloat(el.style.top || "");
  if (!isFinite(L) || !isFinite(T)) {
    /* 没拖过 → 用 CSS 的默认位。但「bottom」有时按 layout viewport 算，
       地址栏一露头皮球就被推到屏幕外了 —— 拿真实渲染位置核一遍，出界才摆回来 */
    if (!el.getBoundingClientRect) return;
    var rr = el.getBoundingClientRect();
    if (!rr.width && !rr.height) return;                   /* 还没渲染出来 */
    var out = rr.top < R.top - 1 || (rr.top + rr.height) > (R.top + R.h + 1)
           || rr.left < R.left - 1 || (rr.left + rr.width) > (R.left + R.w + 1);
    if (!out) return;
    orbPlace(el, Math.max(R.left + 6, Math.min(R.left + R.w - rr.width - 6, rr.left)),
                 Math.max(R.top + 6, Math.min(R.top + R.h - rr.height - 6, rr.top)), "");
    return;
  }
  var ed = ls("edge", "");
  var minT = R.top + 6, maxT = R.top + R.h - h - 6; if (maxT < minT) maxT = minT;
  var nT = Math.max(minT, Math.min(T, maxT)), nL = L;
  if (ed === "c") {
    /* 停在中间 → 水平跟着屏幕重新居中（转屏、改窗口大小也不会偏） */
    nL = Math.max(R.left + 4, Math.round(R.left + R.w / 2 - w / 2));
  } else if (ed !== "l" && ed !== "r") {                   /* 贴边时故意露一半，只管上下 */
    var minL = R.left + 6, maxL = R.left + R.w - w - 6; if (maxL < minL) maxL = minL;
    nL = Math.max(minL, Math.min(L, maxL));
  }
  if (Math.abs(nT - T) > 1 || Math.abs(nL - L) > 1) orbPlace(el, nL, nT, ed);
}
function vpWatch() {
  try {
    var W = vpWin(), vv = W.visualViewport, t = null;
    var on = function () {
      clearTimeout(t);
      t = setTimeout(function () {
      orbClamp();
      if (sheetIsOn()) sheetFit();          /* 全屏编辑页跟着一起重贴（键盘抬起/转屏） */
      if (panelOpen) { placePanel(); fitHeight(); }
      }, 130);
    };
    if (vv && vv.addEventListener) { vv.addEventListener("resize", on); vv.addEventListener("scroll", on); }
    /* ⚠ 必须挂主窗口：脚本自己跑在小 iframe，监听 iframe 的 resize 没用 */
    W.addEventListener("resize", on);
    W.addEventListener("orientationchange", on);
  } catch (e) {}
}

/* =====================================================================
   面板摆位：屏幕正中（略微偏上，给底下居中的球让位）
   ===================================================================== */
function placePanel() {
  var p = QI("panel"); if (!p) return;
  var R = vpRect();
  var w = Math.min(432, R.w - 12);
  p.style.maxHeight = "";
  var h = p.offsetHeight || 420;
  var maxH = Math.max(220, Math.min(R.h - 24, Math.round(R.h * 0.80)));
  if (h > maxH) h = maxH;
  var x = Math.round(R.left + R.w / 2 - w / 2);
  /* 略微偏上：给底下居中的球让出位置，免得面板一开就把球吃了 */
  var y = Math.round(R.top + R.h / 2 - h / 2 - Math.min(30, R.h * 0.04));
  x = Math.max(R.left + 6, Math.min(x, R.left + R.w - w - 6));
  y = Math.max(R.top + 8, Math.min(y, R.top + R.h - h - 8));
  p.style.left = x + "px";
  p.style.top = y + "px";
  p.style.width = w + "px";
  p.style.transformOrigin = "center center";
}
function fitHeight() {
  var p = QI("panel"); if (!p) return;
  var H = vpRect().h;
  p.style.maxHeight = Math.max(240, Math.min(H - 24, Math.round(H * 0.80))) + "px";
}

/* =====================================================================
   toast / 状态灯 / 确认框
   ===================================================================== */
var toastH = null;
function toast(m) {
  var t = QI("toast"); if (!t) return;
  t.textContent = m; t.classList.add("on");
  clearTimeout(toastH); toastH = setTimeout(function () { t.classList.remove("on"); }, 2400);
}
function setSync(cls, tx) {
  var el = QI("sync"), t = QI("syncTx"); if (!el || !t) return;
  el.className = "st" + (cls ? " " + cls : ""); t.textContent = tx;
}
function pip(on) {
  var o = QI("orb"); if (!o) return;
  var p = o.querySelector(".pip");
  if (on && !p) { var s = pdoc.createElement("span"); s.className = "pip"; o.appendChild(s); }
  if (!on && p) { try { p.remove(); } catch (e) {} }
}
var dlgYesCb = null, dlgRiskCb = null;
function dlgOpen(title, msg, yesTx, cb, riskTx, riskCb) {
  var m = QI("mask"), d = QI("dlg"); if (!m || !d) return;
  QI("dlgT").textContent = title;
  QI("dlgM").innerHTML = msg;
  var yb = QI("dlgYes");
  yb.style.display = "";                 /* 收录弹框藏过它，别的弹框还要用 */
  yb.textContent = yesTx || "确定";
  yb.style.display = yesTx === null ? "none" : "";
  QI("dlgNo").textContent = "取消";
  var rb = QI("dlgRisk");
  if (rb) { rb.textContent = riskTx || ""; rb.classList.toggle("on", !!riskCb); }
  dlgYesCb = cb; dlgRiskCb = riskCb || null;
  m.classList.add("on"); d.classList.add("on");
}
function dlgClose() {
  var m = QI("mask"), d = QI("dlg"); if (!m || !d) return;
  m.classList.remove("on"); d.classList.remove("on"); dlgYesCb = null; dlgRiskCb = null;
}

/* =====================================================================
   渲染
   ===================================================================== */
var MACROS = [["char", "主角"], ["user", "对方"]];   /* 就这两个，多的不放 */
function macroRow(id) {
  return '<div class="macros">' + MACROS.map(function (m) {
    return '<span class="chip" data-mc="{{' + m[0] + '}}" data-mct="' + id + '">'
      + m[1] + '<u>{{' + m[0] + '}}</u></span>';
  }).join("") + "</div>";
}

/* ── 搜索 ──
   只有预设和世界书能搜 —— 正则总共就那几条，给它一个输入框是把地方白扔了。
   展开时机你来定：点放大镜才出来，用完关掉，平时不占那一行。 */
function noHitHTML(where) {
  if (!findQ) return '<div class="empty">没有条目</div>';
  return '<div class="nohit">' + where + '没有含「<b>' + esc(findQ) + '</b>」的东西<br>'
    + '<span style="font-size:11px">换个短一点的词，或者点右边的 × 退出搜索</span></div>';
}
function findCount(n) {
  var el = QI("fnum"); if (!el) return;
  el.textContent = findQ ? (n ? n + " 条" : "没有") : "";
}
function findShow(on) {
  findOn = !!on;
  /* 全屏编辑页开着就去点放大镜：不先收起来的话，它整屏盖着，你根本看不见搜出来什么 */
  if (findOn && sheetIsOn()) finishEdit();
  var box = QI("find"); if (box) box.classList.toggle("on", findOn);
  var b = QI("pFind"); if (b) b.classList.toggle("on", findOn);
  if (findOn) { var i = QI("finp"); if (i) { try { i.focus(); } catch (e) {} } }
  else findSet("");
}
function findSet(v) {
  var nv = String(v == null ? "" : v).trim().toLowerCase();
  if (nv === findQ) return;
  /* ⚠ 换搜索词之前先收口：列表马上要被过滤，正在编辑的那条很可能被滤掉，
     编辑器一消失，刚打的字就随风去了 —— finishEdit 会兜底先写回去 */
  finishEdit();
  findQ = nv;
  renderList();
}
function findClear() {
  var i = QI("finp"); if (i) i.value = "";
  findSet("");
  if (i) { try { i.focus(); } catch (e) {} }
}

function render() { renderNav(); renderList(); updStat(false); }

function renderNav() {
  var bs = QI("nav").querySelectorAll("button");
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-v") === view);
  var isP = view === "preset";
  QI("tabs").style.display = isP ? "" : "none";
  QI("pFind").style.display = (view === "regex" || view === "export") ? "none" : "";
  var pn = QI("pname");
  pn.textContent = isP ? presetName
    : view === "world" ? wbBooks.length + " 本世界书"
    : view === "export" ? "导出 / 备份"
    : rxAll().length + " 条正则";
  pn.title = pn.textContent;
  /* 预设切换小框：只在预设页出现（别的页签切预设没意义） */
  var sw = QI("pSwap");
  if (sw) {
    sw.style.display = isP ? "" : "none";
    sw.title = "切换酒馆预设（当前：" + presetName + "）";
  }
  QI("how").textContent = isP ? "" : (view === "export" ? "" : ((view === "world" ? wbHow : rxHow) || ""));
}

/* ── A 预设 ──
   底部工具行（在条目最底下、「已同步」栏之上）：＋新增条目 / ⇅排序 / ▤分组。
   分组视图 = 有分组时按组折叠（跟世界书一个路子）；排序 / 分组模式下每行多出对应的钮 */
function presetRowHTML(it, m, seq) {
  var L = tokOf(it.content), pct = it.enabled ? Math.round(L / m * 100) : 0;
  var grpName = "";
  for (var gi = 0; gi < pgGroups.length; gi++) {
    if ((pgGroups[gi].members || []).indexOf(it.identifier) >= 0) { grpName = pgGroups[gi].name; break; }
  }
  var picked = it.identifier && pgSel[it.identifier];
  /* 占位提示词（世界书前 / 角色描述 / 聊天记录这些插入位置）本来就没有正文，
     编辑它没意义 —— 标出来，也不给编辑按钮，免得改出坏数据 */
  var phTag = it.ph ? '<i class="phtag" title="酒馆的插入位置，本来就没有正文">插入点</i>' : "";
  var h = '<div class="row in' + (it.enabled ? "" : " off") + (it.locked ? " locked" : "")
    + (editingId === it.id ? " open-ed" : "") + '" data-id="' + it.id + '" style="animation-delay:' + Math.min(seq * 14, 180) + 'ms">'
    +   (pGrpMode && it.identifier
        ? '<span class="pkbox' + (picked ? " on" : "") + '" data-selpg="' + escAttr(it.identifier) + '" title="点一下收录 / 取消">'
          + (picked ? SV.check : "") + "</span>"
        : "")
    +   '<span class="sw' + (it.enabled ? " on" : "") + '" data-sw="' + it.id + '"></span>'
    +   '<span class="nm' + (it.ph ? " ph" : "") + '"'
    +     (it.ph ? '' : ' data-ed="' + it.id + '" title="点一下编辑"') + '>'
    +     hlTx(it.name, findQ) + phTag + "</span>"
    +   (pGrpMode && grpName ? '<span class="gtag">' + esc(grpName) + "</span>" : "")
    +   '<span class="cc">' + fmt(L) + "</span>"
    +   (pSort && it.identifier
        ? '<span class="grip" data-grip="' + escAttr(it.identifier) + '" title="按住上下拖动">' + SV.grip + "</span>"
        : "")
    +   (it.ph ? "" : '<span class="op" data-edbtn="' + it.id + '" title="编辑">' + SV.edit + "</span>")
    +   '<span class="ratio"><i style="width:' + pct + '%"></i></span>'
    + "</div>";
  if (editingId === it.id) h += '<div class="edmark">正在全屏编辑这条…</div>';
  /* 名字里没命中但正文里命中了 → 摘要一行告诉你它命在哪，不然满屏同名的行看不出区别 */
  if (findQ && editingId !== it.id && txtHas(it.content, findQ)) {
    h += '<div class="row sub"><span class="nm sub">' + hlTx(snip(it.content, findQ, 58), findQ) + '</span></div>';
  }
  return h;
}
function pgSelCount() {
  var n = 0;
  for (var k in pgSel) if (pgSel[k]) n++;
  return n;
}
function presetToolRow() {
  var h = '<div class="ltools">'
    + '<span class="chip add" data-padd="1" title="在最底下加一条新条目">' + SV.plus + '新增条目</span>'
    + '<span class="chip' + (pSort ? " cur" : "") + '" data-psort="1" title="按住 ☰ 上下拖动调顺序">' + SV.updown + '排序</span>'
    + '<span class="chip' + (pGrpMode ? " cur" : "") + '" data-pgrp="1" title="点条目左边的框选中，再确认收录进分组">' + SV.grid + '分组</span>';
  if (pGrpMode) {
    var n = pgSelCount();
    h += '<span class="cnt" id="pgcnt">' + (n ? "已选 " + n + " 条" : "点框选中") + "</span>"
      +  '<span class="chip go2" data-pgok="1">确认收录</span>'
      +  '<span class="chip" data-pdone="1">取消</span>';
  } else if (pSort) {
    h += '<span class="chip go2" data-pdone="1">完成</span>';
  }
  return h + "</div>";
}
function listPreset() {
  var el = QI("list"); if (!el) return;
  var m = maxLen(), h = "", shown = 0, hit = 0;
  function pass(it) {
    if (tab === "on" && !it.enabled) return false;
    if (tab === "off" && it.enabled) return false;
    return true;
  }
  function hitName(it) { return !findQ || txtHas(it.name, findQ) || txtHas(it.content, findQ); }
  var grouped = pgGroups.length > 0 && !findQ && !pSort && !pGrpMode;
  if (grouped) {
    var taken = {};
    pgGroups.forEach(function (g) {
      var mem = (g.members || []).filter(function (idf) {
        for (var i = 0; i < items.length; i++) if (items[i].identifier === idf) return true;
        return false;
      });
      var open = !!pgFold[g.id];
      var on = 0;
      mem.forEach(function (idf) {
        for (var i = 0; i < items.length; i++) if (items[i].identifier === idf && items[i].enabled) { on++; break; }
      });
      h += '<div class="grp' + (open ? " open" : "") + '" data-gid="pg:' + escAttr(g.id) + '">'
        +  '<div class="ghead" data-gh="pg:' + escAttr(g.id) + '">'
        +    '<span class="cv">' + SV.chev + '</span>'
        +    '<span class="gn">' + esc(g.name) + '<i>' + mem.length + " 条</i></span>"
        +    '<span class="gnum"><b>' + on + "</b>/" + mem.length + "</span>"
        +    '<span class="star" data-pgdel="' + escAttr(g.id) + '" title="解散这个分组（条目不会少）">'
        +      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>'
        +  "</div>"
        +  '<div class="gbody">' + (open
            ? (mem.length ? mem.map(function (idf) {
                for (var i = 0; i < items.length; i++) if (items[i].identifier === idf) {
                  if (!pass(items[i])) return "";
                  shown++; hit++;
                  return presetRowHTML(items[i], m, shown);
                }
                return "";
              }).join("") : '<div class="empty" style="padding:14px">这个组里还没有条目</div>')
            : "")
        +  "</div></div>";
      mem.forEach(function (idf) { taken[idf] = 1; });
    });
    var rest = items.filter(function (it) { return !taken[it.identifier]; });
    if (rest.length) {
      var openR = !!pgFold["__rest"], onR = 0;
      rest.forEach(function (it) { if (it.enabled) onR++; });
      h += '<div class="grp' + (openR ? " open" : "") + '" data-gid="pg:__rest">'
        +  '<div class="ghead" data-gh="pg:__rest">'
        +    '<span class="cv">' + SV.chev + '</span>'
        +    '<span class="gn">未分组<i>' + rest.length + " 条</i></span>"
        +    '<span class="gnum"><b>' + onR + "</b>/" + rest.length + "</span>"
        +  "</div>"
        +  '<div class="gbody">' + (openR
            ? rest.map(function (it) { if (!pass(it)) return ""; shown++; hit++; return presetRowHTML(it, m, shown); }).join("")
            : "")
        +  "</div></div>";
    }
  } else {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!pass(it) || !hitName(it)) continue;
      shown++; hit++;
      h += presetRowHTML(it, m, shown);
    }
  }
  if (findQ && !hit) { el.innerHTML = noHitHTML("这个预设里"); findCount(0); return; }
  h += unusedBlockHTML();
  h += presetToolRow();
  el.innerHTML = h;
  findCount(hit);
}
/* 酒馆里存在、但没被加进提示词模板的条目 —— 只读展示。
   用户问「我那条怎么不见了」时，答案往往就在这里：它没丢，只是不在模板里。 */
function unusedBlockHTML() {
  if (!unusedItems.length) return "";
  var open = !!pgFold["__unused"];
  var body = open ? unusedItems.map(function (u) {
    /* ⚠ 别用 .row 这个类：列表条目数是按 .row 数的，这里混进去会让人以为多了一条 */
    return '<div class="unrow"><span class="nm">' + esc(u.name) + "</span></div>";
  }).join("") : "";
  return '<div class="grp' + (open ? " open" : "") + '" data-gid="pg:__unused">'
    +  '<div class="ghead" data-gh="pg:__unused">'
    +    '<span class="cv">' + SV.chev + '</span>'
    +    '<span class="gn">没加进模板的<i>' + unusedItems.length + " 条</i></span>"
    +    '<span class="gnum" style="font-size:10px;color:var(--ink3)">在酒馆下拉框里</span>'
    +  "</div>"
    +  '<div class="gbody">' + (body
        || '<div class="unrow"><span class="nm">这些条目在酒馆里存在，但没被加进提示词模板 —— '
        + '在酒馆的提示词下拉框里能加进来（这里只读，不会替你改）</span></div>') + "</div></div>";
}
/* =====================================================================
   全屏编辑页
     以前编辑框长在列表那一行的下面：手机上键盘一弹，整行被挤到屏幕最开头，
     或者缩成一条缝。现在点编辑就进这一整屏 —— 正文在最上面占满，
     名字 / 角色 / 关键词钉在最底下（正好在键盘上沿），高度不随键盘缩。
   ===================================================================== */
var edWhich = "";                    /* "p" 预设 / "w" 世界书 / "r" 正则 / "" 没在编辑 */
function sheetEl() { return QI("sheet"); }
function sheetIsOn() { var s = sheetEl(); return !!(s && s.classList.contains("on")); }
/* 高度一律用视觉视口实测：vh / inset:0 量的是「地址栏收起时」的尺寸，手机上比可见区域大 */
function sheetFit() {
  var s = sheetEl(); if (!s || !s.classList.contains("on")) return;
  var R = vpRect();
  s.style.left = R.left + "px"; s.style.top = R.top + "px";
  s.style.width = R.w + "px";  s.style.height = R.h + "px";
}
function sheetRender() {
  var s = sheetEl(); if (!s) return;
  s.innerHTML = (edWhich === "w" ? sheetWorld() : (edWhich === "r" ? sheetRegex() : sheetPreset()));
}
function sheetShow(kind) {
  edWhich = kind;
  var s = sheetEl(); if (!s) return;
  sheetRender(); s.classList.add("on"); sheetFit();
  try { pdoc.body.style.overflow = "hidden"; } catch (e) {}   /* 底下那层别跟着一起滑 */
  /* 键盘是异步抬起来的：刚 focus 时拿到的常常还是抬起之前的尺寸，多补几枪 */
  var waits = [30, 90, 240, 520, 900];
  for (var i = 0; i < waits.length; i++) setTimeout(sheetFit, waits[i]);
  focusEditor('[data-edbox="' + edBoxId() + '"]', kind === "r" ? "input" : "textarea");
}
function sheetClose() {
  var s = sheetEl();
  edWhich = "";
  if (s) { s.classList.remove("on"); s.innerHTML = ""; }
  try { pdoc.body.style.overflow = ""; } catch (e) {}
}
function edBoxId() { return edWhich === "p" ? editingId : (edWhich === "w" ? edW : edR); }
/* 编辑框在哪个容器里：全屏页开着就在全屏页，否则还在列表里 */
function edScope(id) {
  var s = QI("sheet");
  if (s && s.classList.contains("on") && s.querySelector('[data-edbox="' + id + '"]')) return s;
  return QI("list");
}
function sheetHead(tit) {
  return '<div class="shd">'
    + '<span class="back" data-shback="1" title="返回列表">' + SV.left + '</span>'
    + '<span class="tit">' + esc(tit) + '</span>'
    + '<span class="ok" data-shok="1">完成</span>'
    + '</div>';
}
function roleSelect(id, cur) {
  return '<select data-role="' + id + '">' + ["system", "user", "assistant"].map(function (r) {
    return '<option value="' + r + '"' + (cur === r ? " selected" : "") + ">" + r + "</option>";
  }).join("") + "</select>";
}
function triButtons(id, cur) {
  return '<span class="tri">' + TRI.map(function (kv) {
    return '<button data-tr="' + kv[0] + '" data-tid="' + id + '"'
      + (cur === kv[0] ? ' class="on"' : "") + ">" + kv[1] + "</button>";
  }).join("") + "</span>";
}
function sheetPreset() {
  var it = byId(editingId); if (!it) return "";
  var nm = draft && draft.name !== null ? draft.name : it.name;
  var ct = draft && draft.content !== null ? draft.content : it.content;
  var rl = draft && draft.role ? draft.role : it.role;
  return '<div data-edbox="' + it.id + '">'
    + sheetHead(nm || "（没名字的条目）")
    + '<div class="sarea">'
    +   '<span class="slb">正文 · 这条就是要发给 AI 的东西</span>'
    +   '<textarea data-ta="' + it.id + '" spellcheck="false" placeholder="写点什么…">' + esc(ct) + "</textarea>"
    +   '<div class="smeta">' + macroRow(it.id) + '<span class="grow"></span>'
    +     '<span class="stok" data-cnt="' + it.id + '">' + fmt(tokOf(ct)) + " tok</span>"
    +   "</div>"
    + "</div>"
    + '<div class="sft">'
    +   '<div class="srow"><span class="lb">名字</span>'
    +     '<input type="text" data-nm="' + it.id + '" value="' + escAttr(nm) + '" placeholder="条目名"></div>'
    +   '<div class="srow"><span class="lb">角色</span>' + roleSelect(it.id, rl)
    +     '<span class="grow"></span><span class="smeta">停手一秒自动存</span></div>'
    + "</div></div>";
}
function sheetWorld() {
  var ref = wByEid(edW); if (!ref) return "";
  var b = wbFind(ref[0]), e = wbEntry(ref[0], ref[1]); if (!e) return "";
  var nm = draftW && draftW.name !== undefined ? draftW.name : (e.comment || "");
  var ct = draftW && draftW.content !== undefined ? draftW.content : (e.content || "");
  var kk = draftW && draftW.key !== undefined ? draftW.key : (e.key || []).join(", ");
  return '<div data-edbox="' + edW + '">'
    + sheetHead((b ? b.name + " › " : "") + (nm || "（没标题）"))
    + '<div class="sarea">'
    +   '<span class="slb">条目内容</span>'
    +   '<textarea data-wta="' + edW + '" spellcheck="false" placeholder="写进去的东西…">' + esc(ct) + "</textarea>"
    +   '<div class="smeta">' + macroRow(edW) + '<span class="grow"></span>'
    +     '<span class="stok" data-wcnt="' + edW + '">' + fmt(tokOf(ct)) + " tok</span>"
    +   "</div>"
    + "</div>"
    + '<div class="sft">'
    +   '<div class="srow"><span class="lb">标题</span>'
    +     '<input type="text" data-wnm="' + edW + '" value="' + escAttr(nm) + '" placeholder="条目标题"></div>'
    +   '<div class="srow"><span class="lb">关键词</span>'
    +     '<input type="text" data-wkey="' + edW + '" value="' + escAttr(kk) + '" placeholder="逗号分隔，空＝常驻"></div>'
    +   '<div class="srow"><span class="lb">触发</span>' + triButtons(edW, triOf(e))
    +     '<span class="grow"></span><span class="smeta">停手一秒自动存</span></div>'
    + "</div></div>";
}
function sheetRegex() {
  var i = parseInt(String(edR).slice(1), 10);
  var r = rIdx[i] ? rxById(rIdx[i]) : null; if (!r) return "";
  var d = draftR || {};
  return '<div data-edbox="' + edR + '">'
    + sheetHead(r.name || "（没名字的规则）")
    + '<div class="sarea">'
    +   '<span class="slb">替换为</span>'
    +   '<textarea data-rrep="' + edR + '" spellcheck="false" placeholder="替换成的内容">'
    +     esc(d.replace !== undefined ? d.replace : r.replace) + "</textarea>"
    + "</div>"
    + '<div class="sft">'
    +   '<div class="srow"><span class="lb">名字</span>'
    +     '<input type="text" data-rnm="' + edR + '" value="' + escAttr(d.name !== undefined ? d.name : r.name) + '" placeholder="规则名"></div>'
    +   '<div class="srow"><span class="lb">查找</span>'
    +     '<input type="text" style="font-family:var(--mono)" data-rfind="' + edR + '" value="'
    +       escAttr(d.find !== undefined ? d.find : r.find) + '" placeholder="正则表达式"></div>'
    +   '<div class="srow"><span class="smeta">'
    +     (r.disabled ? "当前：关闭" : "当前：开启") + " · 停手一秒自动存</span></div>"
    + "</div></div>";
}
function wbEntry(bn, uid) {
  var b = wbFind(bn); if (!b) return null;
  for (var i = 0; i < b.entries.length; i++) if (String(b.entries[i].uid) === String(uid)) return b.entries[i];
  return null;
}

/* ── B 世界书 ──
   两级，跟正则一个路子：
     ① 一级 = 酒馆自己的四个分类（已启用 / 全局 / 角色 / 当局聊天），默认全折叠，
        展开只有【书名行】，一条一本，带星 / 整本开关 / 进条目
     ② 二级 = 点书名进去才是条目界面（返回条钉顶，书名和整本开关都在上面）
   之前把条目做成「书下面的第三层折叠」，三层套娃既难认也难点 —— 现在砍掉那一层。
   idx 用序号当 id：书名里可能有引号斜杠一堆怪字符，写进属性容易出事 */
var WB_CATS = [
  ["on", "已启用", "整本开关打开的书"],
  ["global", "全局", "对所有角色生效"],
  ["character", "角色", "只对当前角色生效"],
  ["chat", "当局聊天", "只对这段聊天生效"]
];
var wbCatOpen = {};   /* "on"/"global"/"character"/"chat" → 展没展开，默认全折叠 */
var wbBook = null;    /* 正看着的这本书；null = 一级分类列表 */
var wIdx = [];
function wbEid(b, e) { wIdx.push([b.name, e.uid]); return "w" + (wIdx.length - 1); }
function wByEid(id) { var i = parseInt(String(id).slice(1), 10); return wIdx[i] || null; }
function wbCatKey(b) { return b.scope === "chat" ? "chat" : (b.scope === "character" ? "character" : "global"); }
function wbCatBooks(k) {
  return wbBooks.filter(function (b) { return k === "on" ? b.whole === true : wbCatKey(b) === k; });
}
function wbOpenBook(name) {
  if (!wbFind(name)) return;
  edW = null; draftW = null; wbBook = name;
  var el = QI("list"); if (el) el.scrollTop = 0;
  renderList();
}
function wbBack() { edW = null; draftW = null; wbBook = null; renderList(); }

function listWorld() {
  var el = QI("list"); if (!el) return;
  wIdx = [];
  if (!wbBooks.length) {
    el.innerHTML = '<div class="empty">没读到世界书<br><span style="font-size:11px">这台酒馆可能没提供世界书接口</span></div>';
    return;
  }
  if (wbBook && !wbFind(wbBook)) wbBook = null;        /* 书被人删了 → 退回一级 */
  if (wbBook) { bookView(el); return; }
  el.innerHTML = findQ ? wbSearchView() : catView();
}
/* 跨书搜：一级标题 name + 触发词 + 正文全都算，搜到就直接摊成一张结果清单。
   ⚠ 每张表都要跟着 wIdx 走 —— id 是按渲染顺序发的，漏一个就全错位 */
function wbHitTest(b, e) {
  return txtHas(e.comment, findQ) || txtHas((e.key || []).join(" "), findQ) || txtHas(e.content, findQ);
}
function wbSearchView() {
  var rows = [], src = {};
  wbBooks.forEach(function (b) {
    b.entries.forEach(function (e) {
      if (!wbHitTest(b, e)) return;
      rows.push(wbHitRow(b, e)); src[b.name] = 1;
    });
  });
  var nB = Object.keys(src).length;
  return '<div class="wtool"><span class="lbl">搜“' + esc(findQ) + '”</span>'
    + '<span class="grow"></span>'
    + '<span class="tag">' + rows.length + " 条 · " + nB + " 本书</span></div>"
    + (rows.length ? rows.join("") : noHitHTML("所有世界书里"));
}
function wbHitRow(b, e) {
  var id = wbEid(b, e), t = triOf(e);
  var keys = (e.key || []).length ? e.key.join(" / ") : "";
  return '<div class="entrow' + (t === "off" ? " dis" : "") + '" data-eid="' + id + '">'
    + '<span class="tri">' + TRI.map(function (kv) {
        return '<button data-tr="' + kv[0] + '" data-tid="' + id + '"'
             + (t === kv[0] ? ' class="on"' : "") + ">" + kv[1] + "</button>";
      }).join("") + "</span>"
    + '<span class="tx" data-hit="' + id + '" title="点一下跳进这本书并定位到这条">'
    +   '<div class="t1"><b class="bk">' + hlTx(b.name, findQ) + '</b><i class="sep"> › </i>'
    +     hlTx(e.comment || "(无标题)", findQ) + "</div>"
    +   '<div class="t2">' + (keys ? "<em>" + hlTx(keys, findQ) + "</em> " : "")
    +     hlTx(snip(e.content, findQ, 46), findQ) + "</div>"
    + "</span>"
    + '<span class="cc">' + fmt(tokOf(e.content)) + "</span>"
    + "</div>";
}
/* 点了搜出来的结果：进那本书 → 过滤 → 滚到那一条闪一下。
   renderList 是同步改 innerHTML 的，所以这里不用 setTimeout 慢半拍 ——
   跟着这一次点击直接定位，手感才对得上 */
function wbHitGo(id) {
  var ref = wByEid(id); if (!ref) return;
  wbOpenBook(ref[0]);
  locateRow(id);
}
function locateRow(id) {
  var list = QI("list"), el = list && list.querySelector('[data-eid="' + id + '"]');
  if (!el) return;
  try { el.scrollIntoView({ block: "center" }); } catch (e) {}
  el.classList.remove("flash");
  void el.offsetWidth;                                  /* 逼一次重排，动画才会重新跑 */
  el.classList.add("flash");
  setTimeout(function () { el.classList.remove("flash"); }, 1300);
}
function catView() {
  var h = '<div class="wtool">'
        + '<span class="chip add" data-grpadd="1">' + SV.plus + '新建分组</span>'
        + '<span class="grow"></span>'
        + "</div>";
  h += WB_CATS.map(function (kv) {
    var bs = wbCatBooks(kv[0]);
    var open = !!wbCatOpen[kv[0]];
    var st = wbStatNumbers(bs);
    return '<div class="grp' + (open ? " open" : "") + '" data-gid="cat::' + kv[0] + '">'
      + '<div class="ghead" data-gh="cat::' + kv[0] + '">'
      +   '<span class="cv">' + SV.chev + '</span>'
      +   '<span class="gn">' + kv[1] + '<i>' + kv[2] + '</i></span>'
      +   '<span class="gnum">' + (kv[0] === "on" ? "<b>" + st.on + "</b>/" + st.tot : bs.length + " 本") + '</span>'
      + '</div>'
      + '<div class="gbody">' + (open ? (bs.length ? bs.map(bookRow).join("")
          : '<div class="empty" style="padding:14px">这一类里没有书</div>') : "") + '</div>'
      + '</div>';
  }).join("");
  /* 自定义分组排在四个系统分类下面：这是你自己攒的摆位习惯，不用就不显示 */
  wbGroups.forEach(function (g) {
    var bs = (g.books || []).map(wbFind).filter(Boolean);
    var open = !!wbOpen["g:" + g.id];
    var st = wbStatNumbers(bs);
    h += '<div class="grp' + (open ? " open" : "") + '" data-gid="g:' + escAttr(g.id) + '">'
      + '<div class="ghead" data-gh="g:' + escAttr(g.id) + '">'
      +   '<span class="cv">' + SV.chev + '</span>'
      +   '<span class="gn">' + esc(g.name) + '<i>我的分组</i></span>'
      +   '<span class="star" data-grpdel="g:' + escAttr(g.id) + '" title="删掉这个分组">'
      +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>'
      +   '<span class="gnum"><b>' + st.on + '</b>/' + st.tot + '</span>'
      + '</div>'
      + '<div class="gbody">' + (open ? (bs.length ? bs.map(bookRow).join("")
          : '<div class="empty" style="padding:14px">这个分组里还没有书<br><span style="font-size:10.5px">进书里用底下的「归入分组」加进来</span></div>') : "") + '</div>'
      + '</div>';
  });
  return h;
}
function wbStatNumbers(books) {
  var on = 0, tot = 0;
  books.forEach(function (b) {
    b.entries.forEach(function (e) {
      tot++;
      if (b.whole === true && triOf(e) !== "off") on++;
    });
  });
  return { on: on, tot: tot, books: books.filter(function (b) { return b.whole === true; }).length };
}
/* 一级里的一本书：就一行。点书名或右边那个小箭头 → 进条目界面 */
function bookRow(b) {
  var st = wbStatNumbers([b]);
  var k = wbCatKey(b);
  var tx = k === "chat" ? "聊天" : k === "character" ? "角色" : "全局";
  return '<div class="brow' + (b.whole === true ? "" : " dis") + '" data-bk="' + escAttr(b.name) + '">'
    + '<span class="star' + (b.pinned ? " on" : "") + '" data-pin="' + escAttr(b.name) + '" title="置顶">' + SV.star + '</span>'
    + '<span class="bn" data-bopen="' + escAttr(b.name) + '" title="点进去看里面的条目">' + esc(b.name) + '</span>'
    + '<span class="tag ' + k + '">' + tx + '</span>'
    + '<span class="bc">' + (b.loading ? "读取中…" : st.on + "/" + st.tot) + "</span>"
    + '<span class="sw' + (b.whole === true ? " on" : "") + (b.whole === null ? " unk" : "")
    +   '" data-bsw="' + escAttr(b.name) + '" title="整本启用 / 停用"></span>'
    + '<span class="into" data-bopen="' + escAttr(b.name) + '" title="看条目">' + SV.chev + '</span>'
    + "</div>";
}
/* 二级：这本书的条目界面 */
function bookView(el) {
  var b = wbFind(wbBook);
  if (!b) { wbBook = null; el.innerHTML = catView(); return; }
  /* 在书里也跟着搜：标题 / 触发词 / 正文，命中的才留下来 */
  var ents = findQ ? b.entries.filter(function (e) { return wbHitTest(b, e); }) : b.entries;
  var st = wbStatNumbers([b]);
  var k = wbCatKey(b);
  var h = '<div class="bhd">'
    + '<span class="icox" data-bclose="1" title="回到书列表">' + SV.left + '</span>'
    + '<span class="tag ' + k + '">' + (k === "chat" ? "聊天" : k === "character" ? "角色" : "全局") + '</span>'
    + '<span class="bnm" title="' + escAttr(b.name) + '">' + esc(b.name) + '</span>'
    + '<span class="bc">' + st.on + "/" + st.tot + "</span>"
    + '<span class="sw' + (b.whole === true ? " on" : "") + (b.whole === null ? " unk" : "")
    +   '" data-bsw="' + escAttr(b.name) + '" title="整本启用 / 停用"></span>'
    + "</div>";
  if (b.whole !== true) {
    h += '<div class="warn">整本没启用 —— 酒馆不会把这本书送进提示词。<br>'
      +  '下面这些条目改了也不生效，先把上面那个开关打开。</div>';
  }
  if (b.loading) {
    h += '<div class="empty" style="padding:26px 16px">正在读这本书的条目…<br>'
      +  '<span style="font-size:11px">这台酒馆的读接口是异步的，会慢半拍</span></div>';
  } else if (!ents.length) {
    h += findQ
      ? '<div class="nohit">「' + esc(b.name) + '」里没有含「<b>' + esc(findQ) + '</b>」的条目<br>'
        + '<span style="font-size:11px">点上面的 ← 回到分类，再搜就是跨所有书了</span></div>'
      : '<div class="empty" style="padding:26px 16px">这本书里还没有条目<br>'
        + '<span style="font-size:11px">酒馆面板里看得见条目、这儿却是空的：'
        + '多半是读接口换了（异步版），把这行左边的诊断复制给 AI 就能接着修。</span>'
        + '<br><span class="chip" data-probe="1" style="margin-top:9px">复制接口诊断</span></div>';
  } else {
    h += ents.map(function (e) { return entRow(b, e); }).join("");
  }
  h += '<div class="wtool">'
     + '<span class="lbl">归入分组</span>'
     + '<select data-grpsel="' + escAttr(b.name) + '">' + grpOptions(b.name) + "</select>"
     + '<span class="grow"></span>'
     + '<button class="btn sm" data-bdel="' + escAttr(b.name) + '">删除整本</button>'
     + "</div>";
  el.innerHTML = h;
}
function grpOptions(name) {
  var cur = "";
  for (var i = 0; i < wbGroups.length; i++) if ((wbGroups[i].books || []).indexOf(name) >= 0) cur = wbGroups[i].id;
  return '<option value="">— 未分组 —</option>' + wbGroups.map(function (g) {
    return '<option value="' + escAttr(g.id) + '"' + (g.id === cur ? " selected" : "") + ">" + esc(g.name) + "</option>";
  }).join("");
}
function entRow(b, e) {
  var id = wbEid(b, e), t = triOf(e);
  var keys = e.key && e.key.length ? e.key.join(" / ") : "";
  var lbl = e.comment || "(无标题)";
  return '<div class="entrow' + (t === "off" ? " dis" : "") + '" data-eid="' + id + '">'
    + '<span class="tri">' + TRI.map(function (kv) {
        return '<button data-tr="' + kv[0] + '" data-tid="' + id + '"'
             + (t === kv[0] ? ' class="on"' : "") + ">" + kv[1] + "</button>";
      }).join("") + "</span>"
    + '<span class="tx" data-wed="' + id + '" title="点一下编辑">'
    +   '<div class="t1">' + hlTx(lbl, findQ) + "</div>"
    +   '<div class="t2">' + (keys ? "<em>" + hlTx(keys, findQ) + "</em> " : "")
    +     hlTx(snip(e.content, findQ, 40), findQ) + "</div>"
    + "</span>"
    + '<span class="cc">' + fmt(tokOf(e.content)) + "</span>"
    + "</div>"
    + (edW === id ? '<div class="edmark">正在全屏编辑这条…</div>' : "");
}

/* ── C 正则 ── */
var rIdx = [];
function listRegex() {
  var el = QI("list"); if (!el) return;
  findCount(0);                       /* 这页不参与搜索，别把上一页的计数留在这儿 */
  rIdx = [];
  var h = "", any = 0;
  RX_KEYS.forEach(function (kv) {
    var arr = rxBucket[kv[0]] || [];
    any += arr.length;
    var on = arr.filter(function (r) { return !r.disabled; }).length;
    var open = !!rxOpen[kv[0]];
    h += '<div class="grp' + (open ? " open" : "") + '" data-gid="rx::' + kv[0] + '">'
      +   '<div class="ghead" data-gh="rx::' + kv[0] + '">'
      +     '<span class="cv">' + SV.chev + '</span>'
      +     '<span class="gn">' + kv[1] + '<i>' + (kv[0] === "global" ? "对所有角色生效"
            : kv[0] === "character" ? "只对当前角色生效" : "只对当前预设生效") + '</i></span>'
      +     '<span class="gnum"><b>' + on + "</b>/" + arr.length + "</span>"
      +   "</div>"
      +   '<div class="gbody">' + (open ? arr.map(function (r) { return rxRow(r); }).join("") : "") + "</div>"
      + "</div>";
  });
  if (!any) h = '<div class="empty">没读到正则<br><span style="font-size:11px">这台酒馆可能没提供正则接口</span></div>';
  el.innerHTML = h;
}
function rxRow(r) {
  rIdx.push(r.id); var id = "r" + (rIdx.length - 1);
  return '<div class="rxrow' + (r.disabled ? " dis" : "") + '">'
    + '<div class="l1">'
    +   '<span class="sw' + (r.disabled ? "" : " on") + '" data-rsw="' + r.id + '"></span>'
    +   '<span class="rxn" data-red="' + id + '" title="点一下编辑">' + esc(r.name) + "</span>"
    +   '<span class="op" data-redbtn="' + id + '" title="编辑">' + SV.edit + "</span>"
    + "</div>"
    + '<div class="l2"><span>' + esc(r.find ? "/ " + r.find + " /" : "(空)") + "</span><span>"
    +   (r.replace ? "→ " + esc(r.replace) : "→ (空)") + "</span></div>"
    + "</div>"
    + (edR === id ? '<div class="edmark">正在全屏编辑这条…</div>' : "");
}

/* =====================================================================
   顶部数字：每一页算的东西不一样
     预设 → 已开启条目的 token（酒馆自己的分词器）
     世界书 → 整本启用 + 条目非禁用，真正会进提示词的那些条目的 token
     正则 → 启用的条数（查找串替换串都很短，算 token 没有意义）
   ===================================================================== */
function updStat(flash) {
  var t = QI("total"), lb = QI("lb"), r2 = QI("r2");
  if (!t) return;
  if (view === "preset") {
    t.innerHTML = fmt(tokSum()) + "<u>tok</u>";
    /* ★ 口径必须写在脸上：这个数是「预设里已开启的条目」，
       不含聊天记录 / 世界书 / 角色信息（那些是运行时注入的，不在预设条目里）。
       跟酒馆原生提示词管理器、柏宝箱显示的「预设总Token」是同一个口径。 */
    if (tokMode !== "api") {
      lb.textContent = "预设里已开启的条目 · 约（拿不到分词器）· 不含聊天记录 / 世界书";
    } else if (tokPending > 0) {
      lb.textContent = "预设里已开启的条目 · 精算中（还差 " + tokPending + " 条）· 不含聊天记录 / 世界书";
    } else {
      lb.textContent = "预设里已开启的条目 · 酒馆同款分词器 · 不含聊天记录 / 世界书";
    }
    r2.innerHTML = '已开 <b>' + onCount() + "</b>/<b>" + items.length + "</b> · <b>" + fmt(enabledTotal()) + "</b> 字";
    tokFill();
  } else if (view === "world") {
    var sum = 0, on = 0, tot = 0, nB = 0;
    wbBooks.forEach(function (b) {
      if (b.whole === true) nB++;
      b.entries.forEach(function (e) {
        tot++;
        if (b.whole !== true || triOf(e) === "off") return;
        on++; sum += tokOf(e.content);
      });
    });
    t.innerHTML = fmt(sum) + "<u>tok</u>";
    lb.textContent = tokMode === "api"
      ? "真正会进提示词的世界书内容 · 只算「整本启用」里非禁用的条目"
      : "世界书内容（约 · 拿不到分词器）";
    r2.innerHTML = "启用 <b>" + nB + "</b>/<b>" + wbBooks.length + "</b> 本 · 条目 <b>" + on + "</b>/<b>" + tot + "</b>";
  } else {
    var arr = rxAll(), rxOn = arr.filter(function (r) { return !r.disabled; }).length;
    t.innerHTML = fmt(rxOn) + "<u>条启用</u>";
    lb.textContent = "正则 · 全局 / 局部 / 预设三组，默认折叠";
    r2.innerHTML = "共 <b>" + arr.length + "</b> 条";
  }
  if (flash) { t.classList.remove("bump"); void t.offsetWidth; t.classList.add("bump"); }
}
function refreshStat() { updStat(false); }

/* =====================================================================
   预设条目：新增 / 排序 / 分组（分组存预设 extensions.sk_pm.groups）
   ===================================================================== */
function ask(t, d) {
  try { if (typeof pwin.prompt === "function") return pwin.prompt(t, d); } catch (e) {}
  return null;
}
function pAddEntry() {
  finishEdit();
  var idf = "skpm_" + Date.now().toString(36);
  var it = { id: "it_new_" + idf, name: "新条目", role: "system", content: "",
             enabled: false, identifier: idf, locked: false, isNew: true };
  items.push(it);
  order.push(idf);
  editingId = it.id; draft = null;
  renderList(); updStat(false);
  save("已新增「新条目」");
  sheetShow("p");
  toast("已加到最后一条，直接写字就行");
}
function pSortItems() {
  var rank = {};
  order.forEach(function (x, i) { if (rank[x] === undefined) rank[x] = i; });
  items.sort(function (a, b) {
    var ra = rank[a.identifier], rb = rank[b.identifier];
    if (ra === undefined && rb === undefined) return 0;
    if (ra === undefined) return 1;
    if (rb === undefined) return -1;
    return ra - rb;
  });
  items.forEach(function (it, i) { it.id = "it" + i; });
}
function pReorderSeq(seq) {
  /* 把显示顺序换成 seq（identifier 序列）：没在 seq 里的条目按原相对顺序缀在后面 */
  var rank = {}, i, x;
  for (i = 0; i < seq.length; i++) if (rank[seq[i]] === undefined) rank[seq[i]] = i;
  var tail = order.filter(function (v) { return rank[v] === undefined; });
  order = [];
  var seen = {};
  for (i = 0; i < seq.length; i++) {
    x = seq[i];
    if (!x || seen[x]) continue;
    seen[x] = 1; order.push(x);
  }
  for (i = 0; i < tail.length; i++) if (!seen[tail[i]]) order.push(tail[i]);
  pSortItems();
  renderList();
  save("顺序已写回，酒馆里就是这个顺序");
}
/* ── 分组收录：分组模式下点框选中 → 确认 → 弹框选已有组 / 输新组名 ── */
function pgPickOpen() {
  var n = pgSelCount();
  if (!n) { toast("先点条目左边的框，把它们选中"); return; }
  var h = '<div class="picklist">'
    + pgGroups.map(function (g) {
        return '<button class="gin" data-pginto="' + escAttr(g.id) + '"><b>' + esc(g.name) + "</b><i>" + (g.members || []).length + " 条</i></button>";
      }).join("")
    + '<div class="ginnew"><input id="pgnewnm" placeholder="输入新组名"><button class="btn sm go" data-pgnewok="1">新建并收录</button></div>'
    + "</div>";
  dlgOpen("把选中的 " + n + " 条收录进哪个分组？", h, null, null);
  QI("dlgYes").style.display = "none";
  QI("dlgNo").textContent = "算了";
}
function pgDoInto(gid, newName) {
  var g = null;
  if (gid === "__new__") {
    newName = String(newName || "").trim() || ("分组 " + (pgGroups.length + 1));
    g = { id: "pg" + Date.now().toString(36), name: newName, members: [] };
    pgGroups.push(g);
  } else {
    for (var i = 0; i < pgGroups.length; i++) if (pgGroups[i].id === gid) g = pgGroups[i];
  }
  if (!g) return;
  g.members = g.members || [];
  var names = [];
  for (var k in pgSel) {
    if (!pgSel[k]) continue;
    pgGroups.forEach(function (x) { x.members = (x.members || []).filter(function (m) { return m !== k; }); });
    g.members.push(k);
    for (var j = 0; j < items.length; j++) if (items[j].identifier === k) { names.push(items[j].name); break; }
  }
  pgSel = {};
  pGrpMode = false;
  renderList();
  save("已把 " + names.length + " 条收进「" + g.name + "」");
  toast("已收录进「" + g.name + "」");
}
/* ── 拖动排序：按住 ☰ 上下拖，实时换位，松手按最终顺序写回 ── */
var dragCtx = null;
function dragStart(e) {
  if (!pSort || dragCtx) return;
  var grip = e.target && e.target.closest ? e.target.closest("[data-grip]") : null;
  if (!grip) return;
  var listEl = QI("list"), row = grip.closest(".row.in");
  if (!listEl || !row) return;
  e.preventDefault();
  dragCtx = { row: row, list: listEl, moved: false };
  row.classList.add("dragging");
  try { if (grip.setPointerCapture) grip.setPointerCapture(e.pointerId); } catch (eX) {}
  /* shadow DOM 里松手事件会丢到主窗口去 —— 主窗口也挂一份兜底（球那边踩过的老坑） */
  try {
    pwin.addEventListener("pointermove", dragMove);
    pwin.addEventListener("pointerup", dragEnd);
    pwin.addEventListener("pointercancel", dragEnd);
  } catch (eX2) {}
}
function dragMove(e) {
  if (!dragCtx) return;
  var rows = Array.prototype.slice.call(dragCtx.list.querySelectorAll(".row.in"));
  var y = e.clientY, target = null, last = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r === dragCtx.row) continue;
    var rc = r.getBoundingClientRect();
    if (!rc.height) continue;
    last = r;
    if (y < rc.top + rc.height / 2) { target = r; break; }
  }
  if (target) {
    if (target.previousElementSibling !== dragCtx.row) { dragCtx.list.insertBefore(dragCtx.row, target); dragCtx.moved = true; }
  } else if (last && last.nextElementSibling !== dragCtx.row) {
    dragCtx.list.insertBefore(dragCtx.row, last.nextElementSibling); dragCtx.moved = true;
  }
  var lc = dragCtx.list.getBoundingClientRect();
  if (lc.height) {
    if (y < lc.top + 36) dragCtx.list.scrollTop -= 9;
    else if (y > lc.bottom - 36) dragCtx.list.scrollTop += 9;
  }
}
function dragEnd() {
  if (!dragCtx) return;
  var ctx = dragCtx; dragCtx = null;
  ctx.row.classList.remove("dragging");
  try {
    pwin.removeEventListener("pointermove", dragMove);
    pwin.removeEventListener("pointerup", dragEnd);
    pwin.removeEventListener("pointercancel", dragEnd);
  } catch (eX) {}
  if (!ctx.moved) return;
  var grips = ctx.list.querySelectorAll(".row.in [data-grip]");
  var seq = [];
  for (var i = 0; i < grips.length; i++) seq.push(grips[i].getAttribute("data-grip"));
  pReorderSeq(seq);
}
function pgDelGroup(gid) {
  var g = null;
  for (var i = 0; i < pgGroups.length; i++) if (pgGroups[i].id === gid) g = pgGroups[i];
  if (!g) return;
  dlgOpen("解散分组「" + g.name + "」？",
    "只是把分组拆掉，里面的条目一个都不会少，会回到「未分组」。",
    "解散", function () {
      pgGroups = pgGroups.filter(function (x) { return x.id !== gid; });
      renderList(); save("已解散分组「" + g.name + "」");
    });
}

/* =====================================================================
   写入（带防抖 + 外部改动优先）
   ===================================================================== */
var sTimer = null, writing = false;
function save(msg) {
  writing = true; setSync("busy", "正在写入预设…");
  clearTimeout(sTimer);
  sTimer = setTimeout(function () {
    writePreset(function (ok, info) {
      writing = false;
      if (ok) { setSync("", "已同步"); if (msg) toast(msg + "（存回「" + info + "」）"); }
      else { setSync("err", "写入失败"); toast("写入失败：" + info); }
    });
  }, 280);
}
/* 外面（酒馆）改了 → 排队中的写入一律作废，不然迟到的旧写入会把外面的新改动盖回去 */
function cancelPending() { clearTimeout(sTimer); writing = false; }

/* =====================================================================
   与外部同步
   ===================================================================== */
function pull(silent) {
  if (writing) return;
  var old = snapItems(), oldEditIdf = null, i;
  /* 先把手里的编辑框收进 draft，不然这一读就把它冲了 */
  if (editingId) harvestDraft(true);
  if (edW) wHarvest(true);
  if (edR) rHarvest(true);
  for (i = 0; i < items.length; i++) if (items[i].id === editingId) oldEditIdf = items[i].identifier;
  cancelPending();
  readPreset();
  if (oldEditIdf) {
    editingId = null;
    for (i = 0; i < items.length; i++) if (items[i].identifier === oldEditIdf) editingId = items[i].id;
    if (!editingId) draft = null;
  }
  render();
  if (sheetIsOn()) sheetRender();
  if (!silent && snapItems() !== old) { toast("检测到酒馆那边的改动，已同步"); pip(true); }
}

/* =====================================================================
   预设：开关 / 编辑
   ===================================================================== */
function toggleItem(id) {
  var it = byId(id); if (!it) return;
  if (it.locked) { toast("这条在预设里没有开关，动不了"); return; }
  it.enabled = !it.enabled;
  renderList(); updStat(true); flashRow(id);
  save((it.enabled ? "已开启「" : "已关闭「") + it.name + "」");
}
function draftElems() {
  if (!editingId) return null;
  var sc = edScope(editingId); if (!sc) return null;
  var box = sc.querySelector('[data-edbox="' + editingId + '"]'); if (!box) return null;
  return {
    box: box,
    nm: box.querySelector('[data-nm="' + editingId + '"]'),
    ta: box.querySelector('[data-ta="' + editingId + '"]'),
    rl: box.querySelector('[data-role="' + editingId + '"]')
  };
}
/* 重渲染前必须先把编辑框里的字收进 draft，不然点个别的地方字就没了 */
function harvestDraft(keepOpen) {
  var d = draftElems(); if (!d || !d.ta) return;
  draft = { name: d.nm ? d.nm.value : null, content: d.ta.value, role: d.rl ? d.rl.value : null };
  if (!keepOpen) editingId = null;
}
function editToggle(id) {
  if (editingId === id && sheetIsOn()) { finishEdit(); return; }   /* 再点一次＝写好并退出 */
  if (edW) wCancel();
  if (edR) rCancel();
  if (editingId) harvestDraft(true);        /* 开着 a 去点 b 时别串味 */
  editingId = id; draft = null;
  renderList();
  sheetShow("p");
}
function focusEditor(boxSel, innerSel) {
  var sc = sheetIsOn() ? QI("sheet") : QI("list");
  var box = sc && sc.querySelector(boxSel);
  if (!box && QI("list")) box = QI("list").querySelector(boxSel);
  if (!box) return;
  /* 别滚动：全屏页自己就是整屏，滚了反而把标题推出去 */
  try { if (box.scrollIntoView) box.scrollIntoView({ block: "nearest" }); } catch (e) {}
  var f = box.querySelector(innerSel);
  if (f && f.getBoundingClientRect) {
    try {
      /* iOS 上不带 preventScroll 的 focus 会把整页顶走 —— 给苹果留这一手 */
      f.focus({ preventScroll: true });
    } catch (e2) { try { f.focus(); } catch (e3) {} }
  } else if (f && f.focus) { try { f.focus(); } catch (e4) {} }
}
/* ── 自动写入：改完不用点「保存」 ──
   停下打字 900ms 就自己写回预设 —— 这是你定的规则。
   刻意不用 260ms：整个世界书/预设文件写一遍是有成本的，太密会卡。 */
var autoTimer = null;
var AUTOMS = 900;
function flushAuto() {
  clearTimeout(autoTimer); autoTimer = null;
  if (!editingId) return;
  var d = draftElems(); if (!d || !d.ta) return;
  var it = byId(editingId); if (!it) return;
  var nm = d.nm ? String(d.nm.value).trim() : "";
  if (!nm) return;                                   /* 名字空着就先不写，别把条目名清空落盘 */
  if (it.name === nm && it.content === d.ta.value && (!d.rl || it.role === d.rl.value)) return;  /* 没动过 */
  it.name = nm; it.content = d.ta.value;
  if (d.rl) it.role = d.rl.value;
  updStat(true);
  save("");                                          /* 不弹通知：打字时每 900ms 弹一次太吵 */
}
/* 收起编辑器前先兜底写一次 —— 不然停在 900ms 之内那几个字就白打了。
   三个编辑器统一走这里，Esc / 点面板外面 / 关球 都会经过。 */
function finishEdit() {
  flushAuto();
  if (edW) wSave(true);
  if (edR) rSave(true);
  dropAuto(); dropAutoW(); dropAutoR();
  cancelEdit(); wCancel(); rCancel();
}
function autoSave() { clearTimeout(autoTimer); autoTimer = setTimeout(flushAuto, AUTOMS); }
function dropAuto() { clearTimeout(autoTimer); autoTimer = null; }
/* 世界书 / 正则的编辑器在打开时也要自动写 —— 但它们不能判定「没变就不写」，
   直接每停一次写一遍（改世界书是整本书重写，代价大，所以用 1.2 秒） */
var autoW = null, autoR = null;
function autoSaveW() { clearTimeout(autoW); autoW = setTimeout(function () { if (edW) wSave(true); }, 1200); }
function autoSaveR() { clearTimeout(autoR); autoR = setTimeout(function () { if (edR) rSave(true); }, 1200); }
function dropAutoW() { clearTimeout(autoW); autoW = null; }
function dropAutoR() { clearTimeout(autoR); autoR = null; }
function saveEdit() {
  dropAuto();
  var d = draftElems(); if (!d || !d.ta) return;
  var it = byId(editingId); if (!it) return;
  var nm = d.nm ? String(d.nm.value).trim() : "";
  if (!nm) { toast("条目名不能为空"); try { d.nm.focus(); } catch (e) {} return; }
  it.name = nm; it.content = d.ta.value;
  if (d.rl) it.role = d.rl.value;
  draft = null; editingId = null;
  sheetClose(); renderList(); updStat(true); flashRow(it.id);
  save("已保存「" + it.name + "」");
}
function cancelEdit() { editingId = null; draft = null; if (edWhich === "p") sheetClose(); renderList(); }
function flashRow(id) {
  var el = QI("list"); if (!el) return;
  var r = el.querySelector('.row[data-id="' + id + '"]'); if (!r) return;
  r.classList.remove("flash"); void r.offsetWidth; r.classList.add("flash");
}
/* 宏：点一下插到光标处，不是追加到末尾 */
function insertMacro(el) {
  var id = el.getAttribute("data-mct"), txt = el.getAttribute("data-mc");
  var sc = edScope(id); if (!sc) return;
  var ta = sc.querySelector('[data-ta="' + id + '"]') || sc.querySelector('[data-wta="' + id + '"]');
  if (!ta) return;
  var v = ta.value;
  var s = (ta.selectionStart == null ? v.length : ta.selectionStart);
  var e = (ta.selectionEnd == null ? v.length : ta.selectionEnd);
  ta.value = v.slice(0, s) + txt + v.slice(e);
  var p = s + txt.length;
  try { ta.focus(); ta.setSelectionRange(p, p); } catch (err) {}
  var cnt = sc.querySelector('[data-cnt="' + id + '"]') || sc.querySelector('[data-wcnt="' + id + '"]');
  if (cnt) cnt.textContent = fmt(tokOf(ta.value)) + " tok";
  if (draft) draft.content = ta.value;
  if (draftW) draftW.content = ta.value;
}

/* =====================================================================
   世界书：分组 / 编辑
   ===================================================================== */
function wbGroupSave() { lsSetJSON("wgrp", wbGroups); }
function wbGroupAdd() {
  var nm = ask("给这个分组起个名", "分组 " + (wbGroups.length + 1));
  if (nm === null || nm === undefined) return;
  nm = String(nm).trim() || ("分组 " + (wbGroups.length + 1));
  var g = { id: "g" + Date.now().toString(36), name: nm, books: [] };
  wbGroups.push(g); wbGroupSave();
  wbOpen["g:" + g.id] = true;
  render(); toast("已建分组「" + nm + "」，把书里的「分组」下拉选到它就行");
}
function wbGroupDel(gid) {
  var id = String(gid).replace(/^g:/, "");
  wbGroups = wbGroups.filter(function (g) { return g.id !== id; });
  wbGroupSave(); render(); toast("已删掉分组（书还在，只是回到未分组）");
}
function wbAssign(name, gid) {
  wbGroups.forEach(function (g) { g.books = (g.books || []).filter(function (n) { return n !== name; }); });
  if (gid) { for (var i = 0; i < wbGroups.length; i++) if (wbGroups[i].id === gid) wbGroups[i].books.push(name); }
  wbGroupSave(); render();
  toast(gid ? "已把「" + name + "」挪进分组" : "已把「" + name + "」挪回未分组");
}
function wbPin(name) {
  var b = wbFind(name); if (!b) return;
  b.pinned = !b.pinned;
  wbBooks.sort(function (x, y) { return (!!y.pinned - !!x.pinned); });
  wbSort(); wbSavePins(); render();
  toast(b.pinned ? "已置顶「" + name + "」" : "已取消置顶");
}
function wbDoDelete(name) {
  if (!wbHasApi()) {
  if (wbBook === name) wbBook = null;                 /* 书没了 → 退回分类列表 */
  wbBooks = wbBooks.filter(function (x) { return x.name !== name; });
  wbOffbook(name); render(); toast("（演示）已删掉「" + name + "」"); return;
  }
  var r = tryOne(["deleteWorldbook", "removeWorldbook", "deleteWorldbookByName"], function () { return [name]; });
  if (!r) { toast("这台酒馆没提供删除世界书的接口，请到它自己的世界书面板里删"); return; }
  if (wbBook === name) wbBook = null;
  wbBooks = wbBooks.filter(function (x) { return x.name !== name; });
  wbOffbook(name); render(); toast("已删掉「" + name + "」");
}
function wbDelete(name) {
  var b = wbFind(name); if (!b) return;
  var n = b.entries.length;
  /* ⚠ 主按钮是「改成停用」而不是「删除」：
     删除是世界书 disappear 级别的不可逆操作，而《先备份再删》那套方案你还没拍板 ——
     在那之前，默认只给可逆的那个选项；真要删，点是右边那个红色的次要按钮。 */
  dlgOpen("这本世界书还要吗？",
    "「<b>" + esc(name) + "</b>」里有 <b>" + n + "</b> 条条目。<br><br>"
    + "建议先<b>停用</b>：书还在，随时能开回来，聊起来也完全一样。<br>"
    + "右边红色的「仍然删除」是真的删掉，<b>没有回收站</b>。",
    b.whole === true ? "改成停用（推荐）" : "就这样留着",
    function () {
      if (b.whole === true) { wbToggleWhole(name); }
      else toast("没动它 —— 本来就是停用状态");
    },
    "仍然删除", function () { wbDoDelete(name); });
}
function wbOffbook(name) {
  wbGroups.forEach(function (g) { g.books = (g.books || []).filter(function (n) { return n !== name; }); });
  wbGroupSave();
}
/* 世界书条目编辑 */
function wDraftElems(id) {
  var sc = edScope(id); if (!sc) return null;
  var box = sc.querySelector('[data-edbox="' + id + '"]'); if (!box) return null;
  return {
    box: box,
    nm: box.querySelector('[data-wnm="' + id + '"]'),
    ta: box.querySelector('[data-wta="' + id + '"]'),
    key: box.querySelector('[data-wkey="' + id + '"]')
  };
}
function wHarvest(keep) {
  var d = wDraftElems(edW); if (!d) return;
  draftW = { name: d.nm ? d.nm.value : "", content: d.ta ? d.ta.value : "", key: d.key ? d.key.value : "" };
  if (!keep) edW = null;
}
function wEditToggle(id) {
  if (edW === id && sheetIsOn()) { finishEdit(); return; }
  if (editingId) { flushAuto(); cancelEdit(); }
  if (edR) rCancel();
  if (edW) wHarvest(true);
  edW = id; draftW = null;
  renderList(); sheetShow("w");
}
function wCancel() { edW = null; draftW = null; if (edWhich === "w") sheetClose(); renderList(); }
function wSave(keepOpen) {
  var d = wDraftElems(edW); if (!d || !d.ta) return;
  var ref = wByEid(edW); if (!ref) return;
  var b = wbFind(ref[0]); if (!b) return;
  var e = null;
  for (var i = 0; i < b.entries.length; i++) if (String(b.entries[i].uid) === String(ref[1])) e = b.entries[i];
  if (!e) return;
  e.comment = d.nm ? String(d.nm.value) : e.comment;
  e.content = d.ta.value;
  e.key = d.key ? String(d.key.value).split(/[,，、]/).map(function (x) { return x.trim(); }).filter(Boolean) : e.key;
  if (wbHasApi()) {
    var uid = String(e.uid);
    var w = wbWriteEnt(b.name, function (x, shape) {
      if (String(x.uid === undefined ? "" : x.uid) === uid) wbApplyFields(x, shape, e);
    });
    if (w === null) { toast("写入失败：没找到能改世界书条目的接口"); return; }
  }
  if (keepOpen) { updStat(true); return; }             /* 自动写入：只算数，不收起编辑器 */
  edW = null; draftW = null;
  if (edWhich === "w") sheetClose();
  render(); updStat(true);
  toast("已保存「" + (e.comment || "(无标题)") + "」");
}

/* =====================================================================
   正则编辑
   ===================================================================== */
function rDraftElems(id) {
  var sc = edScope(id); if (!sc) return null;
  var box = sc.querySelector('[data-edbox="' + id + '"]'); if (!box) return null;
  return {
    nm: box.querySelector('[data-rnm="' + id + '"]'),
    find: box.querySelector('[data-rfind="' + id + '"]'),
    rep: box.querySelector('[data-rrep="' + id + '"]')
  };
}
function rHarvest(keep) {
  var d = rDraftElems(edR); if (!d) return;
  draftR = { name: d.nm ? d.nm.value : "", find: d.find ? d.find.value : "", replace: d.rep ? d.rep.value : "" };
  if (!keep) edR = null;
}
function rEditToggle(id) {
  if (edR === id && sheetIsOn()) { finishEdit(); return; }
  if (editingId) { flushAuto(); cancelEdit(); }
  if (edW) wCancel();
  if (edR) rHarvest(true);
  edR = id; draftR = null;
  renderList(); sheetShow("r");
}
function rCancel() { edR = null; draftR = null; if (edWhich === "r") sheetClose(); renderList(); }
function rSave(keepOpen) {
  var d = rDraftElems(edR); if (!d) return;
  var i = parseInt(String(edR).slice(1), 10);
  var r = rIdx[i] ? rxById(rIdx[i]) : null;
  if (!r) return;
  r.name = d.nm ? String(d.nm.value).trim() || r.name : r.name;
  r.find = d.find ? d.find.value : r.find;
  r.replace = d.rep ? d.rep.value : r.replace;
  if (rxHasApi() && !rxCommit(r)) return;
  if (keepOpen) { updStat(true); return; }             /* 自动写入：编辑器保持开着 */
  edR = null; draftR = null;
  if (edWhich === "r") sheetClose();
  render(); updStat(true);
  toast("已保存「" + r.name + "」");
}

/* =====================================================================
   导出：导出去的文件要能原样导回酒馆（给人装）
     预设   → 整份（酒馆预设 JSON）/ 仅条目（prompts+prompt_order，也能当新预设导回）
     世界书 → 整本书（酒馆世界书 JSON，可在世界书面板导入）/ 仅条目清单（给人看 / 给 AI）
     正则   → 全部 / 全局 / 局部（当前角色）/ 预设（正则扩展「导入」认的数组）
   ===================================================================== */
var exType = "preset", exSel = "", exMode = "full";
function exChoices() {
  if (exType === "preset") {
    var arr = [];
    try { var f = call("getPresetNames"); if (f) { var a = f.run(); if (Array.isArray(a)) arr = a.map(String); } } catch (e) {}
    if (!arr.length) arr = apiReady() ? [] : ["演示预设"];
    return arr.map(function (n) { return [n, n === "in_use" ? "当前预设（in_use）" : n]; });
  }
  if (exType === "world") {
    if (!wbBooks.length) wbLoad();
    return wbBooks.map(function (b) { return [b.name, b.name]; });
  }
  return [["all", "全部正则"], ["global", "全局"], ["character", "局部（当前角色）"], ["preset", "预设"]];
}
function exModes() {
  if (exType === "preset") return [["full", "整份预设"], ["items", "仅条目"]];
  if (exType === "world") return [["full", "整本书（能导回酒馆）"], ["items", "仅条目清单"]];
  return [["full", "导出（正则就一种）"]];
}
function renderExport() {
  var el = QI("list"); if (!el) return;
  var ch = exChoices();
  if (!exSel || !ch.some(function (c) { return c[0] === exSel; })) exSel = ch.length ? ch[0][0] : "";
  var h = '<div class="exwrap">'
    + '<div class="exlb1">导出什么</div>'
    + '<div class="exseg">' + [["preset", "预设"], ["world", "世界书"], ["regex", "正则"]].map(function (kv) {
        return '<button class="exb' + (exType === kv[0] ? " on" : "") + '" data-extype="' + kv[0] + '"><i class="dot"></i>' + kv[1] + "</button>";
      }).join("") + "</div>"
    + '<div class="exlb1">选哪一份</div>'
    + '<div class="exrow"><select id="exSel" class="exsel">'
    +   ch.map(function (c) { return '<option value="' + escAttr(c[0]) + '"' + (c[0] === exSel ? " selected" : "") + ">" + esc(c[1]) + "</option>"; }).join("")
    + "</select></div>"
    + '<div class="exlb1">导出形式</div>'
    + '<div class="exseg">' + exModes().map(function (kv) {
        return '<button class="exb' + (exMode === kv[0] ? " on" : "") + '" data-exmode="' + kv[0] + '"><i class="dot"></i>' + kv[1] + "</button>";
      }).join("") + "</div>"
    + '<button class="btn go exgo" data-exgo="1">' + SV.down + "导出下载</button>"
    + '<div class="exhint">导出的 JSON 能原样导回：预设丢进酒馆预设面板、世界书丢进世界书面板、正则丢进正则扩展的导入。「仅条目」导出的预设 JSON 也当新预设导；条目清单是给人看 / 给 AI 读的。</div>'
    + "</div>";
  el.innerHTML = h;
}
function exSafeName(s) { return String(s || "导出").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 60); }
/* 酒馆助手 WorldbookEntry[] → 酒馆世界书文件格式（entries 字典），导入面板直接认 */
function wbTHtoST(th) {
  var st = th.strategy || {};
  var pos = ({ before_character_definition: 0, after_character_definition: 1, before_author_note: 2,
    after_author_note: 3, at_depth: 4, before_example_messages: 5, after_example_messages: 6, outlet: 7 })[th.position && th.position.type] || 4;
  var role = ({ system: 0, user: 1, assistant: 2 })[(th.position && th.position.role) || "system"];
  return {
    uid: th.uid, displayIndex: th.uid, comment: th.name || "",
    disable: th.enabled === false,
    constant: st.type === "constant", selective: st.type === "selective", vectorized: st.type === "vectorized",
    key: (st.keys || []).map(String), keysecondary: ((st.keys_secondary && st.keys_secondary.keys) || []).map(String),
    selectiveLogic: 0, scanDepth: (st.scan_depth === "same_as_global" ? null : (st.scan_depth === undefined ? null : st.scan_depth)),
    position: pos, role: role, depth: (th.position && th.position.depth) || 4, order: (th.position && th.position.order) || 100,
    content: th.content || "",
    useProbability: true, probability: th.probability === undefined ? 100 : th.probability,
    excludeRecursion: !!(th.recursion && th.recursion.prevent_incoming),
    preventRecursion: !!(th.recursion && th.recursion.prevent_outgoing),
    delayUntilRecursion: (th.recursion && th.recursion.delay_until) || false,
    sticky: (th.effect && th.effect.sticky) || null, cooldown: (th.effect && th.effect.cooldown) || null,
    delay: (th.effect && th.effect.delay) || null,
    addMemo: true, group: "", groupOverride: false, groupWeight: 100,
    caseSensitive: null, matchWholeWords: null, useGroupScoring: null,
    automationId: "", ignoreBudget: false
  };
}
function exBuild() {
  if (exType === "preset") {
    var raw;
    try { var f = call("getPreset"); raw = f ? f.run(exSel === "" ? "in_use" : exSel) : null; } catch (e) { raw = null; }
    if (!raw && !apiReady()) raw = mockPreset();
    if (!raw || !raw.prompts) return null;
    if (exMode === "items") {
      var ps = Array.isArray(raw.prompts) ? raw.prompts : [];
      return { name: "预设条目_" + exSafeName(exSel === "in_use" ? (presetName || "当前预设") : exSel) + ".json",
        data: { prompts: ps,
                prompt_order: [{ order: ps.filter(function (p) { return p && p.identifier; }).map(function (p) {
                    return { identifier: p.identifier, enabled: p.enabled !== false }; }) }] } };
    }
    var obj = {};
    if (raw.settings && typeof raw.settings === "object") Object.keys(raw.settings).forEach(function (k) { obj[k] = raw.settings[k]; });
    obj.prompts = raw.prompts;
    if (raw.prompts_unused) obj.prompts_unused = raw.prompts_unused;
    if (raw.extensions) obj.extensions = raw.extensions;
    if (Array.isArray(raw.prompt_order)) obj.prompt_order = raw.prompt_order;
    return { name: "预设_" + exSafeName(exSel === "in_use" ? (presetName || "当前预设") : exSel) + ".json", data: obj };
  }
  if (exType === "world") {
    var b = wbFind(exSel); if (!b) return null;
    if (exMode === "items") {
      return { name: "世界书条目_" + exSafeName(b.name) + ".json",
        data: b.entries.map(function (e) {
          return { 条目名: e.comment, 关键词: e.key, 内容: e.content,
                   状态: e.disable ? "禁用" : (e.constant ? "常驻" : "关键词触发"), 顺序: e.order };
        }) };
    }
    try {
      var a = call("getWorldbook");
      var th = a ? a.run(b.name) : null;
      var list = Array.isArray(th) ? th : (th && th.entries ? Object.keys(th.entries).map(function (k) { return th.entries[k]; }) : null);
      if (!list) return { name: "世界书_" + exSafeName(b.name) + ".json", data: { entries: (function () { var o = {}; b.entries.forEach(function (e) { o[e.uid] = e; }); return o; })() } };
      var o2 = {};
      list.forEach(function (e) { var st = wbTHtoST(e); o2[st.uid] = st; });
      return { name: "世界书_" + exSafeName(b.name) + ".json", data: { entries: o2 } };
    } catch (e2) { return null; }
  }
  /* 正则 */
  var norm = exSel === "all" ? rxAll() : (rxBucket[exSel] || []);
  return { name: "正则_" + (exSel === "all" ? "全部" : exSel) + "_" + exSafeName(new Date().toISOString().slice(0, 10)) + ".json",
    data: norm.map(rxToRaw) };
}
function exGo() {
  var r = exBuild();
  if (!r) { toast("导出失败：没拿到数据（接口诊断已落 sk_pm_probe）"); probeDump(); return; }
  var txt = JSON.stringify(r.data, null, 2);
  try {
    var blob = new Blob([txt], { type: "application/json" });
    var doc = pdoc, a = doc.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = r.name;
    doc.body.appendChild(a); a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 900);
    toast("已导出 " + r.name);
  } catch (e) {
    /* 下载被挡：退而求其次，弹个框让你手动复制 */
    dlgOpen("下载失败，手动复制", "把下面的 JSON 全选复制，存成 <b>" + esc(r.name) + "</b> 一样能用。",
      "关闭", null);
    var box = QI("dlgM");
    if (box) {
      box.innerHTML += '<textarea class="excp" readonly>' + esc(txt) + "</textarea>";
    }
  }
}

/* =====================================================================
   报错自留档
     真机上崩了以后界面上一点痕迹都没有（连球都点不动），只能靠猜。
     现在任何漏接的错误都落 localStorage(sk_pm_err)，面板顶上给一条红条，
     点一下就复制到剪贴板 —— 不用再去翻控制台。
   ===================================================================== */
var lastErr = "";
/* 球上的红环：错是在面板里显示的，可「面板打不开」恰恰是出问题时最常见的状态，
   所以球自己也得变个颜色 —— 让人一眼看出是脚本病了，不是他手指没点准 */
function orbBad() {
  try { var o = QI("orb"); if (o) o.classList.add("bad"); } catch (e) {}
}
/* ── ★ 错是谁的？ ──
   酒馆里装着一堆插件（柏宝箱、状态球、正则助手……），它们自己炸了也会冒泡到
   window / pwin 的 error 事件上。以前我们照单全收 —— 别的插件拉 update.json
   拿到的是一坨 HTML（404 页），JSON.parse 就报「Unexpected token '<'」，
   那个错被我们记成「预设管理器报错」，害得人以为是自己这个脚本坏了。

   判据：**栈帧的行号落在我们自己脚本的代码区间内** → 是我们的问题。
   （别用函数名判：别家插件里也有 toast / render / mount 这种常见名字。）
   兜底：栈里读不出任何一帧我们自己的代码 → 判不了 → 当别人的，不记。
   宁可漏报，也不要拿别人的错来吓人 —— 漏报还能靠自检卡看到启动步骤。 */
function isOwnErr(e) {
  var st = "";
  try { st = String((e && e.stack) || ""); } catch (x) { st = ""; }
  if (!st) return false;                    /* 没栈 → 判不了 → 不记（宁可漏报） */
  if (!OWN_FILE) return false;              /* 量不出自己的区间 → 判不了 → 不记 */
  /* 把栈里所有「文件:行」都抠出来，逐个比 */
  var re = /([^\s()]+):(\d+):(\d+)/g, m;
  while ((m = re.exec(st)) !== null) {
    if (m[1] === OWN_FILE) {
      var ln = parseInt(m[2], 10);
      if (ln >= OWN_LO && ln <= OWN_HI) return true;
    }
  }
  return false;
}
/* 自己代码路径上 catch 到的错：不管栈底是谁抛的，都得记。
   用一个标记把「主动 catch」和「外来冒泡」区分开。 */
function ownErr(e) { try { if (e) e.__own = 1; } catch (x) {} return e; }
function errSave(e) {
  /* ⚠ 入口闸门：不是我们自己的错就别记。
     别人插件的错只在控制台留一声，不点亮红条、不点亮红环、不写进自留档。
     ⚠ 但「我们自己代码路径上 catch 到的错」一定要记 —— 那是我们自己的失败，
        哪怕栈底是别人抛的（比如酒馆助手接口炸了）。用 ownErr() 标一下。 */
  if (!(e && e.__own) && !isOwnErr(e)) {
    try { console.warn("[预设管理器] 收到一个不属于我们的错误（已忽略，不点亮红条）：", e); } catch (x0b) {}
    return;
  }
  var msg = "", st = "";
  try { msg = String((e && e.message) || e || "未知错误").slice(0, 240); } catch (x) { msg = "未知错误"; }
  try { st = String((e && e.stack) || "").slice(0, 900); } catch (x2) {}
  lastErr = msg + (st ? "\n" + st : "");
  try { lsSet("err", lastErr + "\n@ " + new Date().toISOString()); } catch (x3) {}
  try { console.error("[预设管理器] 出错了：", e); } catch (x4) {}
  try { orbBad(); } catch (x5) {}
}
function errBarHTML() {
  if (!lastErr) return "";
  return '<div class="errbar" data-errcopy="1" title="点一下复制整段报错">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">'
    +   '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5h.01"/></svg>'
    + '<b>' + esc(String(lastErr).split("\n")[0]) + '</b>'
    + '<span class="x">点这里复制给 AI</span></div>';
}
function errCopy() {
  var txt = "【预设管理器 " + VER + " 报错】\n" + (lastErr || "（没有记录）")
    + "\n\n接口情况：\n" + JSON.stringify(probeDump().api);
  var done = false;
  try {
    var n = (pwin && pwin.navigator) || navigator;
    if (n.clipboard && n.clipboard.writeText) { n.clipboard.writeText(txt); done = true; }
  } catch (e) {}
  if (!done) { try { ask("复制这段报错给 AI（长按全选）", txt); } catch (e2) {} }
  toast(done ? "报错已复制，贴给 AI 就行" : "复制失败：报错原文在控制台里");
}

/* =====================================================================
   自检卡
     面板打不开的时候，报错条是看不见的（它在面板里面）—— 这就是以前
     「点不动、又不知道为什么」的黑箱。现在：长按球、或点球开面板失败，
     都会弹这张卡，里面那段直接复制给 AI 就够了。
   ===================================================================== */
function diagBuild() {
  var L = [];
  L.push("版本：" + APP + " " + VER);
  L.push("启动：最后一步=" + (bootStep || "（还没开始）")
       + "   没跑通的步骤=" + (bootFail.length ? bootFail.join(" / ") : "无"));
  L.push("预设：当前=" + (presetName || "（未知）") + "   条目=" + items.length
       + "   空位=" + presetHoles + (presetHoles ? "（酒馆的 prompt_order 指向了已删条目）" : ""));
  L.push("最近报错：" + (lastErr ? String(lastErr).split("\n").slice(0, 4).join("\n") : "无"));
  try { var a = probeDump(); L.push("接口：" + JSON.stringify(a && a.api ? a.api : a)); }
  catch (e) { L.push("接口：读不到"); }
  try {
    var R = vpRect(), o = QI("orb"), rr = o ? o.getBoundingClientRect() : null;
    L.push("视口：" + R.w + "x" + R.h
      + "   visualViewport=" + (pwin && pwin.visualViewport ? "有" : "无")
      + "   PointerEvent=" + (pwin && pwin.PointerEvent ? "有" : "无"));
    if (rr) {
      L.push("球：" + Math.round(rr.left) + "," + Math.round(rr.top) + "  "
        + Math.round(rr.width) + "x" + Math.round(rr.height)
        + "   在屏幕内=" + (rr.top >= -2 && rr.left >= -2 && rr.top <= R.h && rr.left <= R.w ? "是" : "否"));
      /* 命中测试：球那个位置上到底是谁在收点击 —— 被别的东西盖住是最隐蔽的一种「点不动」 */
      try {
        var hx = Math.round(rr.left + rr.width / 2), hy = Math.round(rr.top + rr.height / 2);
        var el = null;
        /* ⚠ 球在 shadow DOM 里：document.elementFromPoint 只会命中宿主 #sk-pm-host，
           拿它判断「被谁盖住」全是误报 —— 要问影子根自己 */
        try { if (root && root.elementFromPoint) el = root.elementFromPoint(hx, hy); } catch (eA) {}
        if (!el) { try { el = pdoc.elementFromPoint(hx, hy); } catch (eB) {} }
        var who = el ? (String(el.tagName || "?").toLowerCase()
            + (el.id ? "#" + el.id : "")
            + (typeof el.className === "string" && el.className ? "." + el.className.split(/\s+/).join(".") : ""))
          : "(空)";
        /* 命中自己人（球 / 球的后代 / 我们的宿主 / 影子根里的东西）都算「没被盖住」 */
        var mine = !el || el === host || el === o || (o.contains && o.contains(el))
                || (root && root.contains && root.contains(el));
        L.push("点球的那个位置，实际命中的是：" + who
          + (mine ? "（是我们自己的浮层，没被盖住）" : "（★ 不是球 —— 被别的东西盖住了）"));
      } catch (e2) { L.push("命中测试：这台不支持 elementFromPoint"); }
    }
  } catch (e3) {}
  return L.join("\n");
}
function diagOpen() {
  var txt = "";
  try { txt = diagBuild(); } catch (e) { txt = "自检本身出错了：" + String((e && e.message) || e); }
  try {
    dlgOpen("脚本自检（有异常就看这里）",
      '<div>下面这段直接复制给 AI —— 球点不动、面板打不开的原因基本都在里面。</div><pre>' + esc(txt) + '</pre>',
      "复制这段", function () { diagCopy(txt); },
      "重启脚本", function () { hardRestart(); });
  } catch (e) {
    try { ask("脚本自检（复制给 AI）", txt); } catch (e2) {}
  }
}
function diagCopy(txt) {
  var done = false;
  try {
    var n = (pwin && pwin.navigator) || navigator;
    if (n.clipboard && n.clipboard.writeText) { n.clipboard.writeText(txt); done = true; }
  } catch (e) {}
  if (!done) { try { ask("复制这段给 AI（长按全选）", txt); done = true; } catch (e2) {} }
  toast(done ? "自检信息已复制" : "复制失败：这段也在控制台里");
}
/* 重启：整个浮层拆了重挂（位置保留，别的一律不留） */
function hardRestart() {
  try { lsSet("err", ""); } catch (e) {}
  bootFail = []; bootDone = {}; bootOK = false; bootStep = ""; lastErr = "";
  try { if (host && host.remove) host.remove(); } catch (e2) {}
  try { setTimeout(mount, 80); } catch (e3) { try { mount(); } catch (e4) { errSave(ownErr(e4)); } }
}
function renderList() {
  if (view === "preset") listPreset();
  else if (view === "world") listWorld();
  else if (view === "export") renderExport();
  else listRegex();
  /* 有报错就在最顶上补一条（各列表都会 innerHTML 重画，放这儿最省事） */
  try {
    var el = QI("list"), bar = errBarHTML();
    if (el && bar) el.insertAdjacentHTML("afterbegin", bar);
  } catch (e) {}
}
function switchView(v) {
  if (v === view) return;
  harvestDraft(false); wHarvest(false); rHarvest(false);
  editingId = null; draft = null; edW = null; draftW = null; edR = null; draftR = null;
  wbBook = null;                                       /* 换页签就退回一级，别卡在某本书里 */
  sheetClose();                                        /* 全屏编辑页也不能跨页签挂着 */
  view = v;
  if (v === "regex" && findOn) findShow(false);        /* 正则那页不搜：直接把搜索收掉 */
  var list = QI("list"); if (list) list.scrollTop = 0;
  if (v === "world" && !wbBooks.length) wbLoad();
  if (v === "regex" && !rxAll().length) rxLoad();
  render();
}

/* =====================================================================
   拖动：球 & 面板
   ===================================================================== */
function dragBind(handle, el, opts) {
  if (!handle || !el) return;
  /* ⚠ 有些手机浏览器 / 老 webview 根本不派发 PointerEvent ——
     那样球既点不动也拖不动，看上去跟「脚本没跑」一模一样。
     所以这里按能力挑一套事件：pointer → touch → mouse。 */
  var HASPTR = false, USETOUCH = false;
  try { HASPTR = !!(pwin && pwin.PointerEvent); } catch (e0) {}
  try { USETOUCH = !HASPTR && !!(pwin && ("ontouchstart" in pwin || (pwin.navigator && pwin.navigator.maxTouchPoints))); } catch (e0b) {}
  var D = HASPTR ? "pointerdown" : (USETOUCH ? "touchstart" : "mousedown");
  var M = HASPTR ? "pointermove" : (USETOUCH ? "touchmove" : "mousemove");
  var U = HASPTR ? "pointerup"   : (USETOUCH ? "touchend"   : "mouseup");
  var C = HASPTR ? "pointercancel" : (USETOUCH ? "touchcancel" : "mouseleave");
  function pt(e) {
    try {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    } catch (e1) {}
    return { x: e.clientX, y: e.clientY };
  }
  handle.addEventListener(D, function (e) {
    if (opts.noDrag && opts.noDrag(e)) return;
    var p = pt(e);
    var r = el.getBoundingClientRect();
    var sx = p.x, sy = p.y, ox = r.left, oy = r.top, moved = false;
    el.style.transition = "none";
    orbPlace(el, ox, oy, undefined);
    if (HASPTR) { try { handle.setPointerCapture(e.pointerId); } catch (err) {} }

    /* 长按球 → 自检卡。面板万一打不开，这是唯一还能拿到线索的路 */
    var lpT = null, lpFired = false;
    if (opts.longPress) {
      lpT = setTimeout(function () {
        if (moved || lpFired) return;
        lpFired = true;
        try { opts.longPress(); } catch (eL) { errSave(ownErr(eL)); }
      }, 900);
    }
    var mv = function (ev) {
      var q = pt(ev), dx = q.x - sx, dy = q.y - sy;
      if (!moved && Math.abs(dx) <= 4 && Math.abs(dy) <= 4) return;
      if (!moved && lpT) { clearTimeout(lpT); lpT = null; }   /* 一动就是拖，不算长按 */
      moved = true;                                   /* 超过 4px 才算拖，不然就是点 */
      var R = vpRect();
      var x = Math.max(R.left + 4, Math.min(ox + dx, R.left + R.w - (el.offsetWidth || 44) - 4));
      var y = Math.max(R.top + 4, Math.min(oy + dy, R.top + R.h - (el.offsetHeight || 44) - 4));
      orbPlace(el, x, y, undefined);
      el.classList.add("moved");
      if (ev.cancelable) ev.preventDefault();
    };
    var done = false;                           /* 双挂可能都收到同一次松手，只认第一次 */
    var up = function (ev) {
      if (done) return; done = true;
      if (lpT) { clearTimeout(lpT); lpT = null; }
      try {
        listens.forEach(function (t) {
          t.removeEventListener(M, mv);
          t.removeEventListener(U, up);
          t.removeEventListener(C, up);
        });
      } catch (e2) {}
      el.style.transition = "";
      if (HASPTR) { try { handle.releasePointerCapture(e.pointerId); } catch (err) {} }
      if (lpFired) return;                     /* 长按已经弹过卡了，别再当点击 */
      /* ⚠ 这一层必须包 try：开关面板里任何一步抛错，都会连带把「球按不动」搞出来 */
      if (!moved) {
        try { opts.click && opts.click(e); }
        catch (ec) { errSave(ownErr(ec)); try { diagOpen(); } catch (ed) {} }
        return;
      }
      /* 松手落到最近的一个停靠位：左 / 中 / 右。
         加「中」是因为默认就在中间 —— 只有左右的话，随手一拖就再也回不到中间了 */
      var R = vpRect(), rr = el.getBoundingClientRect();
      var cx = (rr.left + rr.width / 2) - R.left;
      var third = R.w / 3, nx, ed;
      if (cx < third) { nx = R.left + 10; ed = "l"; }
      else if (cx > R.w - third) { nx = R.left + R.w - rr.width - 10; ed = "r"; }
      else { nx = Math.round(R.left + R.w / 2 - rr.width / 2); ed = "c"; }
      el.style.transition = "left .2s ease, top .2s ease";
      orbPlace(el, nx, parseFloat(el.style.top) || rr.top, ed);
      setTimeout(function () { el.style.transition = ""; }, 220);
      opts.after && opts.after();
    };
    /* ⚠ 同时挂「元素自己」和「主窗口」：
       只挂自己 → 手指拖出元素就断线；只挂主窗口 → 一旦 pointer capture
       没拿到 / 某些老 webview 不派发，松手事件收不到，面板就再也点不开了。
       两个都挂，谁先到算谁，done 保证只处理一次。 */
    var listens = [handle];
    try { if (pwin && pwin !== handle && listens.indexOf(pwin) < 0) listens.push(pwin); } catch (e0c) {}
    try { if (pdoc && pdoc !== handle && pdoc !== pwin && listens.indexOf(pdoc) < 0) listens.push(pdoc); } catch (e0d) {}
    listens.forEach(function (t) {
      t.addEventListener(M, mv, { passive: false });
      t.addEventListener(U, up);
      t.addEventListener(C, up);
    });
  });
}

/* =====================================================================
   面板开合
   ===================================================================== */
function openPanel() {
  var p = QI("panel"); if (!p) return;
  p.classList.add("open"); panelOpen = true;
  placePanel(); fitHeight(); pip(false);
  pull(true);                              /* 每次唤起重读一遍，保证是酒馆里的最新状态 */
  if (view === "world") wbLoad();
  if (view === "regex") rxLoad();
  render();
}
function closePanel() {
  var p = QI("panel"); if (!p) return;
  dlgClose();                                          /* 弹窗跟着收（切换预设列表也在里面） */
  finishEdit();                                      /* 关之前把没写进去的那点改动落盘 */
  cancelPending();
  findShow(false);                                   /* 搜索也一并退干净：下次开是一整份列表 */
  p.classList.remove("open"); panelOpen = false;
}

/* =====================================================================
   心跳：① 把跑丢的球拽回来 ② 你在酒馆里换了预设 → 这边自动跟着换
   ===================================================================== */
var lastFp = "";
function tick() {
  orbClamp();
  /* 启动时哪一步没跑通 → 心跳里自己补跑几次（最多 3 次，别没完没了地试） */
  if (!bootOK && bootFixN < 3) { bootFixN++; bootResume(); }
  if (!apiReady()) return;
  /* ① 酒馆那边换了预设 → 跟着换。
     ⚠ 这两段必须各自 try：以前共用一个 try，读预设一抛错（脏数据），
        后面的内容检测也一起被吃掉 —— 于是「酒馆里改了，插件完全没察觉」。 */
  try {
    var n = loadedName();
    /* ⚠ switching 期间不能跟着换：那是手动切换自己在等酒馆应用完提示词，
       这时候再插一脚会跟它抢着刷新、弹两次 toast、还可能读到中间态。 */
    if (n && n !== presetName && !writing && !switching) {
      readPreset(); lastFp = snapItems(); render(); updStat(true);
      toast("已切到预设「" + n + "」");
      pip(!panelOpen);
      return;
    }
  } catch (e1) { errSave(ownErr(e1)); }
  /* ② 酒馆那边改了内容 → 同步（面板开着才看得见；全屏编辑时不打扰） */
  if (panelOpen && !writing && !sheetIsOn()) {
    try {
      var before = snapItems();
      readPreset();
      if (snapItems() !== before) {
        render(); updStat(true); cancelPending();
        toast("检测到酒馆那边的改动，已同步");
      }
    } catch (e2) { errSave(ownErr(e2)); }
  }
  /* ③ 世界书也一个待遇：酒馆里关了条目 / 取消了整本书 → 这边跟着变。
     （以前只同步预设 —— 世界书只有重开面板才重读，用户在酒馆里改了永远看不见） */
  if (panelOpen && !writing && !sheetIsOn()) {
    try { wbSyncTick(); } catch (e3) { errSave(ownErr(e3)); }
  }
}

/* ── 世界书同步：每 2 拍（约 5 秒）轻查一遍 ──
   ① 整本书的勾选（全局 / 角色 / 聊天绑定）→ 重读 sel，whole 变了就记一笔
   ② 条目的开关和内容 → 重读每本书的条目，指纹变了就重画
   getWorldbook 读的是酒馆内存，没有网络开销；重读也【不打断】正在展开的书 */
var wbTickN = 0;
function wbFp(entries) {
  var s = (entries ? entries.length : 0) + "|";
  for (var i = 0; i < (entries || []).length; i++) {
    var e = entries[i];
    s += (e.enabled ? 1 : 0) + ":" + (e.content ? e.content.length : 0) + ";";
  }
  return s;
}
function wbSyncTick() {
  if (view !== "world" || !wbHasApi() || !wbBooks.length) return;
  if ((++wbTickN) % 2) return;                       /* 别太密：5 秒一次够用了 */
  wbReadSel(function (sel) {
    if (!sel.ok) return;
    var changed = false;
    /* ① 整本书的勾选状态（跟 wbBuild 里算 whole 的口径完全一样） */
    for (var i = 0; i < wbBooks.length; i++) {
      var b = wbBooks[i], whole = null;
      if (b.scope === "character") whole = (sel.primary === b.name) || ((sel.add || []).indexOf(b.name) >= 0);
      else if (b.scope === "chat") whole = true;
      else if (sel.global) whole = sel.global.indexOf(b.name) >= 0;
      if (whole !== null && whole !== b.whole) { b.whole = whole; changed = true; }
    }
    /* ② 条目的开关 / 内容：只查已经读到手的书，正在载入的不碰 */
    var jobs = [];
    wbBooks.forEach(function (bb) {
      if (bb.loading || !bb.entries) return;
      jobs.push({ b: bb, old: wbFp(bb.entries) });
    });
    if (!jobs.length) { if (changed) wbRefreshed(); return; }
    var left = jobs.length;
    jobs.forEach(function (j) {
      wbLoadEntries(j.b, function () {
        left--;
        try { if (wbFp(j.b.entries) !== j.old) changed = true; } catch (eF) {}
        if (left <= 0 && changed) wbRefreshed();       /* 全部查完、确实有变 → 重画 */
      });
    });
  });
}

/* =====================================================================
   启动
   ⚠ 教训 #33：以前是一条链子顺着跑 —— 中途任何一步抛错，后面的事件绑定
      就全没执行，结果就是「球点不动、也拖不动」；而报错只写在面板里，
      面板偏偏又打不开，谁也看不见到底错在哪，只能靠猜。
   现在分三步：① 球先立起来（可点 / 可拖 / 可长按自检）
   ② 事件全绑（逐步记名，谁炸了一眼看得见） ③ 数据最后（可以重跑补一次）
   ===================================================================== */
var bootStep = "", bootFail = [], bootDone = {}, bootOK = false, bootFixN = 0;
function bootStepRun(name, fn) {
  if (bootDone[name]) return true;
  try { bootStep = name; fn(); bootDone[name] = true; return true; }
  catch (e) {
    errSave(ownErr(new Error("启动步骤「" + name + "」：" + String((e && e.message) || e))));
    if (bootFail.indexOf(name) < 0) bootFail.push(name);
    return false;
  }
}
/* ① 球：位置 + 点击 + 拖动 + 长按自检 —— 绝不能被后面任何一步连累 */
function orbInit() {
  var orbEl = QI("orb");
  if (!orbEl) { bootStepRun("球", function () { throw new Error("DOM 里没找到 #orb"); }); return; }
  try {
    /* 恢复上次拖到的位置；没拖过 → 底边居中 */
    var pos = String(ls("pos", "") || "").split(",");
    var placed = false;
    if (pos.length === 2) {
      var x = parseFloat(pos[0]), y = parseFloat(pos[1]);
      if (isFinite(x) && isFinite(y)) { orbPlace(orbEl, x, y, ls("edge", "")); placed = true; }
    }
    if (!placed) orbCenterBottom(orbEl);
    orbClamp();
  } catch (e) { errSave(ownErr(e)); }
  dragBind(orbEl, orbEl, {
    click: onOrbClick,
    longPress: function () { diagOpen(); },
    after: function () { try { if (panelOpen) placePanel(); } catch (e2) { errSave(ownErr(e2)); } }
  });
}
function onOrbClick() {
  try { orbClamp(); } catch (e) {}         /* 被地址栏 / 键盘顶出屏幕的话，先拽回来 */
  if (!bootOK) {
    bootResume();                          /* 启动时哪步没跑通，这里再补一次 */
    if (!bootOK) { try { toast("启动时有一步没跑通 —— 长按球能看原因"); } catch (e0) {} }
  }
  try { panelOpen ? closePanel() : openPanel(); }
  catch (e) { errSave(ownErr(e)); diagOpen(); }    /* 连面板都开不了 → 直接把线索摆出来 */
}
/* ③ 数据：可以重跑（事件不能重绑 —— 重复绑会触发两次） */
function bootResume() {
  var a = bootStepRun("读预设", function () { readPreset(); lastFp = snapItems(); });
  var b = bootStepRun("首屏渲染", function () { render(); updStat(false); });
  bootOK = !!(a && b);
  if (bootOK) { try { var o = QI("orb"); if (o) o.classList.remove("bad"); } catch (e) {} }
  return bootOK;
}
function bootUI() {
  if (ls("night", "0") === "1" && host.classList) host.classList.add("night");
  wbGroups = lsJSON("wgrp", []);
  /* 顺序就是命：先球 → 再事件 → 最后数据 */
  bootStepRun("球", orbInit);
  bootStepRun("事件", bindAll);
  bootResume();
  bootTail();
}
/* 启动收尾：世界书 / 正则等 UI 起来之后再读，别把首屏卡住 */
function bootTail() {
  bootStepRun("延迟读世界书/正则", function () {
    setTimeout(function () {
      try { wbLoad(); rxLoad(); } catch (e) { errSave(ownErr(e)); }
      try { if (panelOpen) render(); else renderNav(); } catch (e2) { errSave(ownErr(e2)); }
      if (!apiReady()) toast("没检测到酒馆，正在用演示数据");
    }, 260);
  });
  bootStepRun("心跳", function () { vpWatch(); setInterval(tick, 2500); });
  if (!ls("tipped", "")) {
    lsSet("tipped", "1");
    setTimeout(function () { toast("点屏幕中间底部的球打开预设管理器"); }, 700);
  }
}
/* ② 事件：全部集中在这儿，一步一步记名，谁炸了一眼看得见 */
function bindAll() {
  bootStepRun("面板拖动", function () {
    dragBind(QI("head"), QI("panel"), {
      noDrag: function (e) { return !!(e.target && e.target.closest && (e.target.closest(".ico") || e.target.closest(".nav"))); }
    });
  });

  bootStepRun("导航", function () {
  QI("nav").addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    switchView(b.getAttribute("data-v"));
  });
  });
  bootStepRun("头部与搜索", function () {
  QI("pClose").addEventListener("click", closePanel);
  /* 预设切换小框：点一下列出酒馆里全部预设，选一个直接切 */
  var sw = QI("pSwap");
  if (sw) sw.addEventListener("click", function (e) {
    e.stopPropagation();
    presetDlgShow();
  });
  QI("pNight").addEventListener("click", function () {
    var on = !(host.classList && host.classList.contains("night"));
    if (host.classList) host.classList.toggle("night", on);
    lsSet("night", on ? "1" : "0");
  });
  QI("pFind").addEventListener("click", function () { findShow(!findOn); });
  QI("fclear").addEventListener("click", function () { findClear(); });
  QI("finp").addEventListener("input", function (e) { findSet(e.target.value); });
  QI("finp").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); }
  });
  });
  bootStepRun("总量点击", function () {
  QI("total").addEventListener("click", function () {
    if (view !== "preset") { toast("这个世界书/正则的统计口径写在上面那行小字里"); return; }
    var top = items.filter(function (i) { return i.enabled; })
      .sort(function (a, b) { return tokOf(b.content) - tokOf(a.content); }).slice(0, 3);
    if (!top.length) { toast("没有已开启的条目"); return; }
    toast("最占 token：" + top.map(function (i) { return i.name + " " + fmt(tokOf(i.content)); }).join(" · "));
  });
  });
  bootStepRun("页签", function () {
  QI("tabs").addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!b) return;
    tab = b.getAttribute("data-t");
    var bs = this.querySelectorAll("button");
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i] === b);
    harvestDraft(true); renderList();
  });
  });

  bootStepRun("弹框按钮", function () {
  QI("mask").addEventListener("click", dlgClose);
  QI("dlgNo").addEventListener("click", dlgClose);
  QI("dlgYes").addEventListener("click", function () { var f = dlgYesCb; dlgClose(); if (f) f(); });
  QI("dlgRisk").addEventListener("click", function () { var f = dlgRiskCb; dlgClose(); if (f) f(); });
  });

  bootStepRun("面板委托", function () {
  /* 面板级事件委托：列表、方案条、编辑框全在这一层（重渲染后不用重绑）
     ⚠ 全屏编辑页 #sheet 不在面板里面 —— 同一套 handler 得给它也挂一份，
        不然进去以后按什么都没反应（这是「全屏」最容易漏的一件事） */
  var panelEl = QI("panel");
  var shEl = QI("sheet");

  var onClickCommon = function (e) {
    var t = e.target;
    var hit = function (a) { return t && t.closest ? t.closest("[" + a + "]") : null; };
    var h;
    /* 全屏编辑页自己的两个按钮：返回（写好并退出）/ 完成 */
    if ((h = hit("data-shback"))) { finishEdit(); return; }
    if ((h = hit("data-shok"))) { finishEdit(); toast("已保存"); return; }
    if ((h = hit("data-errcopy"))) { errCopy(); return; }
    /* 跨书搜出来的结果：整行都是「进那本书并定位」 */
    if ((h = hit("data-hit"))) { wbHitGo(h.getAttribute("data-hit")); return; }
    /* 世界书两级：进书 / 返回分类 —— 书行上同时还有 pin、整本开关，所以先断定进书签 */
    if ((h = hit("data-bopen"))) { wbOpenBook(h.getAttribute("data-bopen")); return; }
    if ((h = hit("data-bclose"))) { wbBack(); return; }
    if ((h = hit("data-pin"))) { wbPin(h.getAttribute("data-pin")); return; }
    if ((h = hit("data-grpadd"))) { wbGroupAdd(); return; }
    if ((h = hit("data-grpdel"))) { wbGroupDel(h.getAttribute("data-grpdel")); return; }
    if ((h = hit("data-bdel"))) { wbDelete(h.getAttribute("data-bdel")); return; }
    /* 预设底部工具行 + 排序 / 分组（这些必须排在 data-gh 折叠前面，同 data-bsw 道理） */
    if ((h = hit("data-padd"))) { pAddEntry(); return; }
    if ((h = hit("data-psort"))) { pSort = !pSort; if (pSort) { pGrpMode = false; pgSel = {}; finishEdit(); } renderList(); return; }
    if ((h = hit("data-pgrp"))) { pGrpMode = !pGrpMode; if (pGrpMode) { pSort = false; pgSel = {}; finishEdit(); } renderList(); return; }
    if ((h = hit("data-pdone"))) { pSort = false; pGrpMode = false; pgSel = {}; renderList(); return; }
    if ((h = hit("data-pgok"))) { pgPickOpen(); return; }
    if ((h = hit("data-selpg"))) {
      var sid = h.getAttribute("data-selpg");
      pgSel[sid] = !pgSel[sid];
      h.classList.toggle("on", !!pgSel[sid]);
      h.innerHTML = pgSel[sid] ? SV.check : "";
      var cnt = QI("pgcnt");
      if (cnt) { var n2 = pgSelCount(); cnt.textContent = n2 ? "已选 " + n2 + " 条" : "点框选中"; }
      return;
    }
    if ((h = hit("data-pgdel"))) { pgDelGroup(h.getAttribute("data-pgdel")); return; }
    /* 接口诊断 */
    if ((h = hit("data-probe"))) { probeCopy(); return; }
    /* 导出页 */
    if ((h = hit("data-extype"))) { exType = h.getAttribute("data-extype"); exMode = "full"; exSel = ""; renderList(); return; }
    if ((h = hit("data-exmode"))) { exMode = h.getAttribute("data-exmode"); renderList(); return; }
    if ((h = hit("data-exgo"))) { exGo(); return; }
    /* ⚠ 这三个必须排在「折叠」前面：它们是 data-gh 容器的子元素，
       一旦让 data-gh 先 closest 命中，点开关就变成折叠整行 —— 开关永远按不动。
       同理 data-tr（也曾侥幸排在后面能用，包一层就会坏）。 */
    if ((h = hit("data-bsw"))) { wbToggleWhole(h.getAttribute("data-bsw")); return; }
    if ((h = hit("data-rsw"))) { rxToggle(h.getAttribute("data-rsw")); return; }
    if ((h = hit("data-tr"))) {
      var tid = h.getAttribute("data-tid"), ref = wByEid(tid);
      if (ref) wbSetTri(ref[0], ref[1], h.getAttribute("data-tr"));
      if (sheetIsOn()) sheetRender();          /* 三档按钮的选中态要当场变回来 */
      return;
    }
    if ((h = hit("data-mc"))) { insertMacro(h); return; }
    if ((h = hit("data-wsave"))) { wSave(); return; }
    if ((h = hit("data-rsave"))) { rSave(); return; }
    if ((h = hit("data-save"))) { saveEdit(); return; }
    if ((h = hit("data-cancel"))) { finishEdit(); return; }
    /* 折叠：世界书分类 / 自定义分组 / 正则组 / 预设分组 共用 data-gh（默认全折叠） */
    if ((h = hit("data-gh"))) {
      var gid = h.getAttribute("data-gh");
      if (gid.indexOf("rx::") === 0) rxOpen[gid.slice(4)] = !rxOpen[gid.slice(4)];
      else if (gid.indexOf("cat::") === 0) wbCatOpen[gid.slice(5)] = !wbCatOpen[gid.slice(5)];
      else if (gid.indexOf("pg:") === 0) pgFold[gid.slice(3)] = !pgFold[gid.slice(3)];
      else wbOpen[gid] = !wbOpen[gid];
      renderList(); return;
    }
    if ((h = hit("data-tr"))) {
      var tid = h.getAttribute("data-tid"), ref = wByEid(tid);
      if (ref) wbSetTri(ref[0], ref[1], h.getAttribute("data-tr"));
      return;
    }
    /* ↑ 上面那些分支后面还有 data-bsw / data-rsw / data-tr 的原位置已被前置 */
    if ((h = hit("data-sw"))) { toggleItem(h.getAttribute("data-sw")); return; }
    if ((h = hit("data-wed"))) { wEditToggle(h.getAttribute("data-wed")); return; }
    if ((h = hit("data-redbtn"))) { rEditToggle(h.getAttribute("data-redbtn")); return; }
    if ((h = hit("data-red"))) { rEditToggle(h.getAttribute("data-red")); return; }
    if ((h = hit("data-edbtn"))) { editToggle(h.getAttribute("data-edbtn")); return; }
    if ((h = hit("data-ed"))) { editToggle(h.getAttribute("data-ed")); return; }
  };
  panelEl.addEventListener("click", onClickCommon);
  if (shEl) shEl.addEventListener("click", onClickCommon);

  var onChangeCommon = function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var gs = t.getAttribute("data-grpsel");
    if (gs) { wbAssign(gs, t.value); return; }
    if (t.id === "exSel") { exSel = t.value; renderList(); return; }
    /* 全屏页里的「角色」下拉：改完当场自动存 */
    var rl = t.getAttribute("data-role");
    if (rl) { if (draft) draft.role = t.value; else if (editingId) harvestDraft(true); autoSave(); return; }
  };
  panelEl.addEventListener("change", onChangeCommon);
  if (shEl) shEl.addEventListener("change", onChangeCommon);
  /* 拖动排序：把手上的 pointerdown（比 click 早，拖动不触发 click） */
  panelEl.addEventListener("pointerdown", dragStart);
  /* 收录弹框里的按钮 + 切换预设列表（弹框不在 panel 里，得单独委托） */  QI("dlgM").addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-pginto],[data-pgnewok],[data-preset]") : null;
    if (!t) return;
    if (t.hasAttribute("data-preset")) { dlgClose(); presetSwitch(t.getAttribute("data-preset")); return; }
    if (t.hasAttribute("data-pginto")) { dlgClose(); pgDoInto(t.getAttribute("data-pginto")); return; }
    var inp = QI("pgnewnm");
    var nm = inp ? inp.value.trim() : "";
    if (!nm) { toast("先写个组名"); if (inp) inp.focus(); return; }
    dlgClose(); pgDoInto("__new__", nm);
  });
  var onInputCommon = function (e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var id, cnt, sc;
    if ((id = t.getAttribute("data-ta"))) {
      sc = edScope(id); if (!sc) return;
      cnt = sc.querySelector('[data-cnt="' + id + '"]');
      if (cnt) cnt.textContent = fmt(tokOf(String(t.value))) + " tok";
      if (draft) draft.content = t.value; else if (editingId) harvestDraft(true);
      autoSave();                                     /* 停下打字就写回去 */
      return;
    }
    if (t.getAttribute("data-nm")) {
      if (draft) draft.name = t.value; else if (editingId) harvestDraft(true);
      autoSave();
      return;
    }
    if ((id = t.getAttribute("data-wta"))) {
      sc = edScope(id); if (!sc) return;
      cnt = sc.querySelector('[data-wcnt="' + id + '"]');
      if (cnt) cnt.textContent = fmt(tokOf(String(t.value))) + " tok";
      if (draftW) draftW.content = t.value; else if (edW) wHarvest(true);
      autoSaveW();
      return;
    }
    if ((id = t.getAttribute("data-wnm"))) { if (draftW) draftW.name = t.value; else if (edW) wHarvest(true); autoSaveW(); return; }
    if ((id = t.getAttribute("data-wkey"))) { if (draftW) draftW.key = t.value; else if (edW) wHarvest(true); autoSaveW(); return; }
    if (t.getAttribute("data-rnm") || t.getAttribute("data-rfind") || t.getAttribute("data-rrep")) {
      if (!draftR && edR) rHarvest(true);
      autoSaveR();
      return;
    }
  };
  panelEl.addEventListener("input", onInputCommon);
  if (shEl) shEl.addEventListener("input", onInputCommon);

  var onKeyCommon = function (e) {
    /* Esc 的顺序：先退搜索（有词就清词，没词就收起那一行），最后才轮到收编辑器 */
    if (e.key === "Escape") {
      if (findQ) { findClear(); e.preventDefault(); return; }
      if (findOn) { findShow(false); e.preventDefault(); return; }
    }
    if (!(editingId || edW || edR)) return;
    if (e.key === "Escape") { finishEdit(); e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      if (editingId) saveEdit(); else if (edW) wSave(); else if (edR) rSave();
      e.preventDefault();
    }
  };
  panelEl.addEventListener("keydown", onKeyCommon);
  if (shEl) shEl.addEventListener("keydown", onKeyCommon);
  });
  /* 点面板外面收起 */
  bootStepRun("点外面收起", function () {
    pdoc.addEventListener("pointerdown", function (e) {
      if (!panelOpen) return;
      var p = QI("panel"), o = QI("orb");
      if (!p) return;
      if (p.contains(e.target) || host.contains(e.target)) return;
      if (o && o.contains(e.target)) return;
      closePanel();
    });
  });
}

/* 全局兜底：脚本里任何一个角落漏出来的错都记下来，
   好歹能在面板上留一句话，别再出现「什么都点不动、又不知道为什么」

   ⚠ 但只记「我们自己的」错：这些监听器在某些 webview 上照样会收到
      主页面里别的插件冒上来的错（状态球拉 update.json 拿到 404 的 HTML，
      JSON.parse 就报「Unexpected token '<'」）。以前全算我们头上，
      白白让人以为是自己这个脚本坏了。归属判定见 isOwnErr()。
      这里不标 ownErr —— 交给 isOwnErr 按行号判。 */
try {
  window.addEventListener("error", function (e) { errSave(e.error || e.message); });
  window.addEventListener("unhandledrejection", function (e) { errSave(e.reason); });
  if (pwin && pwin !== window) {
    pwin.addEventListener("error", function (e) { errSave(e.error || e.message); });
    pwin.addEventListener("unhandledrejection", function (e) { errSave(e.reason); });
  }
} catch (eGuard) {}

/* 量出我们代码区间的上界（文件最后一行）——
   有了 OWN_LO / OWN_HI，才能判断一个错是不是我们自己代码抛出来的 */
try {
  var _own1 = ownLine((new Error()).stack);
  if (_own1 && _own1.file === OWN_FILE) OWN_HI = _own1.line + 1;
} catch (eOwn2) {}

try { mount(); }
catch (eBoot) {
  errSave(ownErr(eBoot));
  try { console.error("[预设管理器] 起不来：", eBoot); } catch (e2) {}
}
})();

  };
  function __fail(e){
    var msg = (e && e.message) ? e.message : String(e);
    var stk = String((e && e.stack) || '').slice(0, 900);
    var txt = '【预设管理器启动失败】\n' + msg + '\n\n' + stk;
    try{ console.error('[SK-PM] boot failed', e); }catch(_){}
    try{ setTimeout(function(){ throw new Error('[SK-PM] ' + msg + ' || ' + stk.replace(/\n/g, ' ~ ')); }, 0); }catch(_){}
    try{ localStorage.setItem('sk_pm_last_error', txt); }catch(_){}
    try{
      var d = (window.parent && window.parent.document) || document;
      var old = d.getElementById('sk-pm-err');
      if(old) old.remove();
      var b = d.createElement('div');
      b.id = 'sk-pm-err';
      b.style.cssText = 'position:fixed;left:14px;top:14px;z-index:2147483600;' +
        'width:min(92vw,520px);max-height:70vh;overflow:auto;' +
        'background:#2a0f0f;color:#ffdada;border:1px solid #ff6b6b;border-radius:12px;' +
        'padding:12px 14px;font:12px/1.65 ui-monospace,Consolas,monospace;' +
        'box-shadow:0 10px 30px rgba(0,0,0,.55)';
      var pre = d.createElement('div');
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = txt;
      b.appendChild(pre);
      var row = d.createElement('div');
      row.style.cssText = 'margin-top:10px;display:flex;gap:8px';
      var btnCopy = d.createElement('button');
      btnCopy.textContent = '复制错误信息';
      btnCopy.style.cssText = 'flex:1;padding:6px 8px;border-radius:8px;border:1px solid #ff6b6b;' +
        'background:#3a1414;color:#ffdada;font:12px inherit;cursor:pointer';
      btnCopy.onclick = function(){
        try{
          if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt);
          btnCopy.textContent = '已复制';
        }catch(_){}
      };
      var btnClose = d.createElement('button');
      btnClose.textContent = '关闭';
      btnClose.style.cssText = 'flex:1;padding:6px 8px;border-radius:8px;border:1px solid #6b3a3a;' +
        'background:transparent;color:#ffdada;font:12px inherit;cursor:pointer';
      btnClose.onclick = function(){ b.remove(); };
      row.appendChild(btnCopy); row.appendChild(btnClose);
      b.appendChild(row);
      d.body.appendChild(b);
    }catch(_){}
  }
  /* 只有真正跑通了才打印 booted：失败了还报 booted，排查时会被误导 */
  try{ __boot(); console.log('[SK-PM] ' + 'booted'); }
  catch(e){ __fail(e); }
})();
