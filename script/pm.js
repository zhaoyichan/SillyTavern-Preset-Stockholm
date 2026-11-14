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
     D 消息截图 整条消息存进手机「下载」；相机 / 复制两个图标竖排在气泡右侧

   ★★★ 改这个文件之前，先把下面这块读完 —— 都是真踩过的坑和实测数据，
        不是说明书。每加一个新功能，把新踩的坑和量出来的数字补到这里。

   ── 版本 / 发版（最容易漏） ──────────────────────────────────────
   · VER 是版本号的唯一真源。build_pm.py / install_pm.py 都从这儿读，
     别在任何别的地方再写死版本号（2026-11-04：info 里硬编码 v0.5，升版本漏改过）。
   · **内容改了就必须升 VER**，不然老用户永远收不到（#26 / #45：
     同名覆盖只改文件、版本不变 = 别人显示旧版本，白改一次）。
   · 打包链：manager.js → build_pm.py → _built_pm.js + 导入件 JSON +
     repo/script/pm.js；装盘 install_pm.py；四处 sha 用 check_sync.py 核。
   · 仓库两条通道（publish.py / 发布台）改动必须同步做（#27 漏同步炸过）。
   · 发布前先看 origin/main 与线上 update.json（#20），别拿本地旧版盖掉他自己发的版。

   ── 真机环境关键数据（Android 12 / Chrome 97 WebView，PDKM00） ─────
   · 那个上下文里 pwin.URL 被覆盖，**createObjectURL 根本不是函数**。
     所以截图链必须 blob / data 双路：SVG 用 data:image/svg+xml +
     encodeURIComponent，下载用 FileReader 转 dataURL 塞 a[href]。
     ★ 别改回只走 blob —— 那是 11-04 真机「下载失败」的真根因。
   · **a[download] + dataURL 在 TauriTavern 的 WebView 里确实能落进「下载」**
     （11-04 05:28 他确认图在），不要再换原生下载通道、更不要写酒馆 data 目录。
   · 图太大会卡死：像素上限 900 万、单边 8000、出图 >10 MB 自动降档重画
     （11-03 那次 1680×60000 ≈ 1 亿像素直接把手机卡死）。
   · blob 链接要 60 秒后才撤（8 秒太早，下载器没读完就断）。
   · 出图日志 + 环境快照（blobCtor / mkURL / fileReader / atob 分项）是排障命根子：
     **手机才复现的 bug 先让他复制日志，别靠读代码猜根因**（11-04 猜错两次）。

   ── 界面 / 摆位 ──────────────────────────────────────────────────
   · 层级总表：球 1001 < 面板 1002 < 全屏编辑页 1100 < 遮罩 1200
              < 弹窗 1201 < toast 1300。改 CSS 前先看这张表（#31）。
   · 脚本跑在小 iframe：pwin / pdoc 指向 parent；位置一律 visualViewport
     实测写死坐标，禁用 vh / inset:0 / top:50%（#29 小窗口飘出去）。
   · 球**默认屏幕正中间**，只有真拖过才写 sk_pm_posuser 并记位置；
     小窗口下 clamp 会把它钳回可视区（贴边不钳 x 是 11-04「找不到球」的根因）。
     ★ 别用 transform 居中：active 的 scale 会顶掉它，且 orbPlace 写绝对 left/top。
   · CSS 初始态与 orbCenter() 必须一致，否则启动第一帧会闪。
   · 启动链：球先立 → 事件全绑 → 数据最后；数据可重跑，事件用 bootDone 防重绑（#33）。
   · flex-wrap 按**初始宽度**判定换行：要让位的元素必须 flex:1 1 0，
     写成 flex:0 1 96px 照样把别人挤到第二行（11-03 顶栏叉钮那次）。

   ── 数据 / 写回 ──────────────────────────────────────────────────
   · prompts 只能就地改字段，绝不整体重建（identifier / marker /
     injection_* 会全丢，#12）。开关要同步写 prompt_order[0].order[j].enabled。
   · 读预设读 in_use；写必须落盘（updatePresetWith 只改内存，#21）。
   · 新版助手很多读接口返回 Promise：一律 isThen / callAsync 兜底（#30），
     写接口用 callThen（isThen 返回 boolean，不能 .then）。
   · prompts 里可能有 undefined 空位：读要跳过、写前必须清（#35）。
   · 顶部 token = **预设里已开启条目**的 token，不含聊天记录 / 世界书 / 角色；
     估算值绝不写进 tokCache（#38，9578 vs 7683 的根因）。
   · 上传文件带进来的字段都不可信：remove 是「执行删除的指令」，
     必须无条件重算 + isSysId() 黑名单，否则会删掉别人的 Main Prompt（#45）。
   · 世界书新建用 createWorldbook（严格版），**禁用 createOrReplaceWorldbook**
     —— 同名会把整本清空。
   · 搜索必须先归一再还原原文区间（tightMap / findRanges / PUNCT），
     **绝不退回 indexOf**；摘要一律 snipHTML，别对已带 mark 的串二次高亮（#46）。

   ── 截图外观 ────────────────────────────────────────────────────
   · bg(day/night) 与 thm(原样/卡片/信纸/夜读) 是**两个独立维度**；
     .sk-shot-wrap.sk-bg-night 必须排在所有 .sk-thm-* **之后**
     （同为 (0,2,0) 权重，顺序就是语义，否则黑底配深色字看不清）。
   · 纯文字兜底图也要跟着 bg 切，不然降级时突然吐一张黑图会像又坏了。
   · ★★ 图标必须挂 **.mes**（气泡外面那层），不能挂 .mes_text ——
     酒馆流式输出是**整块重写 .mes_text 内容**，挂里面的图标每吐一段就被冲掉，
     于是只能每拍重建一次（2026-11-13 他的日志：生成 47 秒补了 18 次）。
     挂 .mes 后重写碰不到它，生成期间零操作。
     代价：.mes 底部压着酒馆自带 .mes_buttons，所以 bottom 不写死，
     由 shotOpsPlace() 实测「气泡底边→.mes 底边」的距离（=按钮那排高度，**与正文长短无关**）
     把图标顶上去；CSS 里的 44px 只是没渲染出来时的兜底。
   · ★★ 扫描成本实测（jsdom，300 条消息 / 3.69 万节点 —— 真机 Chrome 的原生选择器更快，
     但趋势一致）：**全扫 36.6 ms/拍**，只查末尾 3 条 0.6 ms。
     2.5 秒一拍的全扫＝长聊天里持续掉帧 → 现在只有「条数变了 / 换聊天 / 开关 / 换主题」才全扫，
     其余走 lastElementChild 往前数 3 个，**一次 querySelectorAll 都不跑**（测试里有断言）。
     条数用 chat.children.length 判（HTMLCollection 长度是缓存的，几乎零成本）。

   ── 条目编辑页（2026-11-13 修的两个真机问题）──────────────────────
   · ★「点一下正文，全屏突然变成一条窄缝」的根因：点正文 = 切编辑态 → 键盘弹起 →
     sheetFit 按视觉视口重算，页面高度一下少掉键盘那截；查找条（两行 textarea + 按钮行）
     和底栏（名字/角色）都是 flex:none 抢不走，正文框作为唯一 flex:1 被压到几十像素。
     ★ 他明确说了「查找条和底栏都不要收」——所以别靠收它们解决，改成
       ① .tawrap{min-height:44vh}（vh 在这里是对的：它量的就是键盘没弹时的视口，是个不变量）
       ② .sarea{flex:1 0 auto} 不许被压扁，高过可视区就交给 .sheet 纵向滚。
   · ★「之前定位的找不到了」：跳命中的偏移**不许抄别的层的 scrollTop**。
     原因：带 mark 的文字层换行位置跟 textarea 未必逐字对齐；
     更关键是键盘弹起后滚动会被重算，抄来的偏移当场作废。改成按命中**行号**重算（fShowHit），
     并在切过去后的 0.7 秒内补两次（用户一动光标立刻收手，绝不抢）。

   ── 收藏（v0.8）────────────────────────────────────────────────
   · 图标列归两项共用：截图（相机 + 复制）与收藏（星）。**各有各的开关**，
     一项关只摘那几颗，两项都关才整列连容器一起撤（shotOpsSync）。
     顺序固定【星 → 相机 → 复制】：他说过「复制要更靠下，别误触下一页生成」，
     新图标一律往前插，复制永远钉在最后一颗（测试里有断言）。
   · 收藏的 key = 聊天标识 + mesid。**光用 mesid 会串**：每场聊天都从 0 数起，
     不同聊天的第 3 楼会互相当成同一条。出处缓存 _favCtx 在全扫时作废（换聊天就变）。
   · 星的状态一律从收藏夹倒推（favKeys），**不许信 DOM 上的 class** ——
     在收藏页删掉几条之后，聊天里那些星得自己变回空心。
   · 存 localStorage：上限 600 条 / 单条 20000 字（5MB 配额，聊天记录是吃配额大户）。
     导出走 data: URL + <a download>（跟截图同一条路：真机上 createObjectURL 不是函数，见 #44），
     超过 120 万字直接拒绝并说明，别让他看着「点了没反应」。

   ── 收藏阅读页 + 关于 / 更新（v0.9）───────────────────────────────
   · 收藏列表点一行 → **全屏阅读页**（sheetShow("fr")）：大字、可选中、底下一行
     翻上一条 / 下一条 / 删。外壳复用 #sheet（高度靠 sheetFit 的 visualViewport 实测），
     别另起一套遮罩 —— 层级表里它就该跟全屏编辑页同级（1100）。
   · 阅读页**不许抢焦点**：抢了手机键盘弹起来，正好把要读的正文盖掉一半。
   · 收藏页的说明文字他嫌多（原话「不需要那么多的解释啦」），现在只有一排按钮
     + 列表；条数在顶栏（N 条收藏），页里不重复。
   · ★★ 一键更新的三条红线：
     ① 认条目只能「name === 预设管理器 && enabled」，**不能按 id 认** ——
        脚本库里躺着好几条历史重装留下的同名旧条目（enabled=false），
        按 id 挑会挑到那条死的，改了等于没改。
     ② 写之前把旧 content 存 localStorage（sk_pm_bak），关于页给「回滚到 vX」；
        存不下（5MB 配额）就算了，但绝不阻断更新。
     ③ **保存失败必须把内存改回去并明说**（saveSettingsDebounced 不存在 / 抛错）。
        只改内存不落盘＝「覆盖 ≠ 生效」（教训 #45），界面显示成功、重开还是旧版，
        比直接报错更坑。
   · 版本比较用 vcmp（按点分段比数字），别拿字符串比 —— "v0.10" < "v0.9" 会判反。
   · update.json 必须带 `_t=` 时间戳 + cache:"no-store"：手机 WebView 会缓存它，
     都发新版了这边还显示旧的，看着就像更新功能坏了。
   · 脚本跑在 iframe 里，fetch 用 vpWin() 那个 window（跟状态球同一口径）。

   ── v1.1 三个真机翻车（都是他 11-13 报的）────────────────────────
   · ★★ 「收藏之后名字全变成『消息』」：以前取说话人只写 `.mes_name` ——
     那是**我自己造 SVG 时编的类名**，酒馆真实 DOM 里根本没有。
     真结构是 `.mes > .mes_block > .ch_name > .name_text`（名字在 .name_text）。
     酒馆分支五花八门，所以统一走 mesWhoOf()：`.name_text` → `.ch_name` →
     `.mes_name` → `.name` 逐层兜底。收藏、勾选页、截图出图标题全都用它。
     ⚠ 测试里的 mock 当年也写的 `.mes_name`，等于替这个坏实现背书了 ——
       **mock 的结构必须照抄真机 DOM**，否则测试全绿、真机全错。
     另一头：角色卡名以前只认 pwin.this_chid，iframe 里常是 undefined，
     char 空 → 不同角色卡混成一块。现在 name2 / this_chid / characters 三路取。
   · ★★ 「非常卡 / 打开面板卡」：`.sk-shot-ops` 原来是 `opacity:.5` + `transition`，
     **每颗图标都会单独合成一层**。300 条消息 × 3 颗 = 900 个半透明合成层，
     安卓 WebView 滚动、打开面板时都要一层层贴 → 必卡。
     现在：半透明写在 background 上、去掉 transition（只留 :active 瞬时缩放）、
     加 `contain:layout style`。另外面板一开就给 <html> 挂 `.sk-pm-open`，
     把整列图标 display:none —— 遮住了还留它在合成树里，纯属白烧。
     ⚠ 以后给图标加任何 transition / filter / transform 动画，先想清楚乘 900 是多少。
   · ★★ 「点星卡住不动」：favCtx() 和 favTimeOf() **各调一次** SillyTavern.getContext()，
     而这是个重函数（characters / chat / 全部扩展设置拼一遍）。点一次星问两遍，
     手机上就是肉眼可见的一顿。现在 favCtx 一次拿到 char + chat + chat 数组，
     3 秒内复用（换聊天时 shotScan 会 `_favCtx = null` 主动作废）。
   · 「从聊天里挑」按钮他说看不懂（「我就是收藏这一条而已」）——已删。
     收藏页只留【星开关 + 导出 md】，空列表时用一句话讲清星在消息右下角。

   ── v1.2「滑动聊天时卡」＝ 图标一次挂太多（他 11-13：「你一次性要渲染这么多」）──
   · ★★ 以前 shotScan(true) 给**每一条** .mes 都挂图标列：300 条聊天 =
     300 个 .sk-shot-ops + 900 个 <i> + 900 个 <svg> 常驻在 DOM 里，滑动必掉帧。
   · 现在只挂「看得见的」：shotNear() 给【视口内 + 上下 260px 预热】的消息挂，
     滑出去的当场摘掉，最新 SHOT_NEAR(=4) 条常驻（刚生成完那条必须能立刻点星）。
     滑动期间一颗都不挂，停手 300ms 才重算（scroll 监听 capture，window 和 #chat 都收）。
     300 条聊天实测常驻节点 900 → 12~24，与历史长度无关。
   · 主题 / 底色（data-skthm / data-skbg）仍【全量】对齐：只是 class，不值钱；
     只给视口内加的话，老消息滑上来会当场变色，闪一下更难看。
   · ⚠ 别把 shotNear 改回「全量 shotOne」——那正是 900 节点的老路。
     新增消息时仍走 shotRescan 的「末尾 3 条增量」，那条路一次 querySelectorAll 都不跑。

   ── 测试 ────────────────────────────────────────────────────────
   · 每次改完跑 `node _smoke_manager.js`（失败数必须为 0）与 `node _t_json.js`。
     基线（v1.1）：**481 通过 / 0 失败**；JSON **37 / 0**。
   · 测试里禁止固定 setTimeout，一律 waitFor；静态断言**先剥注释**再匹配
     （注释里出现过的函数名 / CSS 串把自己坑过两次）。
   · 更新逻辑用「假网络 + 假脚本库」测（R.w.fetch / SillyTavern.getContext 现场替换），
     别让它真去连 GitHub —— 断网就一片红，看不出是自己改坏了还是网络问题。
   ===================================================================== */
(function () {
"use strict";

var APP = "预设管理器", VER = "v2.5";
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
/* ── 写类接口也要兜底（新建 / 删除这些会改数据的）──
   同样是「新版返回 Promise、老版直接返回值」。
   ⚠ isThen(x) 只是个【判断】，返回 true/false —— 不能写 isThen(x).then(...)，
     那是把布尔值当 Promise 用，一跑就 TypeError（这次就栽在这儿）。
   要包一层：是 Promise 就等它落地，不是就直接当成同步结果用。 */
function callThen(name, args, ok, fail) {
  var a = call(name);
  if (!a) { fail && fail(new Error("这台酒馆没有 " + name + " 接口")); return; }
  var r;
  try { r = a.run.apply(null, args || []); }
  catch (e) { fail && fail(e); return; }
  if (isThen(r)) { r.then(ok, function (e) { fail && fail(e || new Error(name + " 失败了")); }); return; }
  ok(r);
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

/* ── 搜索：先归一，再按【原文区间】命中 ──
   为什么不用 indexOf 硬比（真踩过）：
     你粘进去的一句「北欧人不畏惧死亡…\n因此在对话中谈及死亡时…」，在正文里
     两行之间是有换行的，搜索框一粘贴换行就没了 → 整串对不上，明明有却"找不到"。
     标点同理：正文全角「，」，你打的是半角「,」，也判定不命中。
   所以两边都压成「无空白 + 标点统一 + 小写」的串来比，另外记一张下标表，
   把命中位置还原回原文区间 {s,e}。还原之后才能精确掐那一刀做替换 ——
   否则只能整段重排，那会把用户排版弄乱。
   ① tightMap  ：压平 + 下标表
   ② findRanges：所有命中区间
   ③ hlQ       ：按区间垫浅黄。⚠ 必须先切片段再转义，否则命中落在 "&amp;"
                 这种转义实体里，标出来就是一坨乱码
   ④ snipHTML  ：以第一处命中为中心截摘要，直接产出带 mark 的 HTML */
var PUNCT = {
  "，": ",", "。": ".", "、": ",", "；": ";", "：": ":", "？": "?", "！": "!",
  "（": "(", "）": ")", "【": "[", "】": "]", "「": '"', "」": '"',
  "『": '"', "』": '"', "“": '"', "”": '"', "‘": "'", "’": "'",
  "《": "<", "》": ">", "—": "-", "－": "-", "～": "~", "…": "..."
};
function tightMap(s) {
  s = String(s == null ? "" : s);
  var out = "", map = [], i, j, c, r, lo;
  for (i = 0; i < s.length; i++) {
    c = s.charAt(i);
    if (/\s/.test(c)) continue;                        /* 空白全部不算 */
    r = PUNCT[c];
    if (r) { for (j = 0; j < r.length; j++) { out += r.charAt(j); map.push(i); } }
    else {
      lo = c.toLowerCase();
      /* ⚠ 少数大写字母小写后会变两个字符（İ 之类），那样 map 就错位了 —— 只在长度不变时转 */
      out += (lo.length === 1 ? lo : c);
      map.push(i);
    }
  }
  return { t: out, map: map };
}
function findRanges(hay, q) {
  var res = [], H = tightMap(hay), Q = tightMap(q).t, i = 0, k;
  if (!Q) return res;
  while ((k = H.t.indexOf(Q, i)) >= 0) {
    res.push({ s: H.map[k], e: H.map[k + Q.length - 1] + 1 });
    i = k + Q.length;
  }
  return res;
}
function txtHas(s, q) { return !q || findRanges(s, q).length > 0; }
function hlQ(s, q) {
  s = String(s == null ? "" : s);
  if (!q) return esc(s);
  var rs = findRanges(s, q), out = "", last = 0;
  if (!rs.length) return esc(s);
  for (var i = 0; i < rs.length; i++) {
    out += esc(s.slice(last, rs[i].s)) + "<mark>" + esc(s.slice(rs[i].s, rs[i].e)) + "</mark>";
    last = rs[i].e;
  }
  return out + esc(s.slice(last));
}
function hlTx(s, q) { return hlQ(s, q); }              /* 老名字，别处还在用 */
function snipHTML(s, q, len) {
  s = String(s == null ? "" : s);
  var rs = findRanges(s, q);
  if (!rs.length) return esc(s.replace(/\s+/g, " ").trim().slice(0, len));
  var r = rs[0], st = Math.max(0, r.s - 12), en = Math.min(s.length, st + len);
  var body = s.slice(st, en), inner = hlQ(body, q);
  /* 命中跨行/跨标点时，正文那一段里「看起来」跟关键词不一样（换行被摘要抹掉了），
     高亮可能一处都落不到 → 兜底把第一处的开头标上，别让人以为没搜到 */
  if (inner === esc(body)) {
    var a = r.s - st;
    inner = esc(body.slice(0, a)) + "<mark>" + esc(body.slice(a)) + "</mark>";
  }
  return (st ? "…" : "") + inner + (en < s.length ? "…" : "");
}
function snip(s, q, len) {          /* 纯文本版（不带 mark）：真要高亮请用 snipHTML */
  s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  var rs = findRanges(s, q);
  if (!rs.length) return s.slice(0, len);
  var st = Math.max(0, rs[0].s - 10);
  return (st ? "…" : "") + s.slice(st, st + len);
}
/* 多行输入框跟着内容长高（搜索框 / 查找框 / 替换框都用它）。
   ⚠ jsdom 里 scrollHeight 恒为 0，必须给下限，否则高度会被写成 0（踩过） */
function autogrow(el, max) {
  if (!el || !el.style) return;
  el.style.height = "auto";
  el.style.height = Math.min(Math.max(30, el.scrollHeight || 0), max || 56) + "px";
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
/* ★ v2.4 顺序自检：order 被打成「开着的全在前、关着的全在后」时记在这里（null = 没发现）。
   2026-11-14 他报「全部条目的顺序被异化」：导出的预设里 23 条开的挤在前面、47 条关的甩在后面，
   开关一条没变、条目一条没少 —— 只有顺序被按开关状态重排过。
   这类坏法很隐蔽（看着像排序，其实是顺序表被重写了），所以要留一只眼睛盯着。 */
var ordWarn = null;
/* ★ v2.5：编辑页底栏「名字 / 角色」是收着还是开着。
   放在外面记着，是因为 sheetRender() 会整页重画（查找条一开一关就重画一次）——
   状态若只挂在 DOM 上，重画一次就自己收起来了，他正在改名时会被打断。
   ⚠ 换一条条目进编辑页要复位（见 sheetShow），别把上一条的展开状态带过来。 */
var sftOpen = false;
var ORD_K = "ord";   /* localStorage 键名（ls/lsSet 会自动加 sk_pm_ 前缀 → 实际存 sk_pm_ord），
                        内容是各预设「上一次正常顺序」的快照，用来一键还原 */

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

var findQ = "";        /* 搜索词，按原样保存（大小写/空白/标点归一在 tightMap 里做）；空 = 没在搜 */
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
  ["角色卡补充", "system", "{{char}} 说话带一点懒洋洋的尾音，紧张时会不自觉转打火机。\n对陌生人先观察三轮再开口，语气从客气慢慢变松。", 1],
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
  pUndo = null;                       /* 预设换了/重读了，上一份的撤销快照就作废（id 会对不上） */
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

  /* ★ v2.4 顺序自检：先看「这条顺序是不是被打成两堆」，正常才留快照。
     ⚠ 顺序真被打乱时【绝不能】拿它覆盖快照 —— 不然快照也跟着坏，就再也还原不回来了。 */
  ordWarn = null;
  try {
    var enMap = {};
    for (var kO = 0; kO < items.length; kO++) enMap[items[kO].identifier] = !!items[kO].enabled;
    ordWarn = ordIsGrouped(order, enMap);
    if (!ordWarn) ordSnapPut(presetName, order);
  } catch (eOrd) {}

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
    /* 正文框定高（v2.5：全实测）—— 测试直接驱动，不用真弹键盘 */
    ta: { room: taRoom, fit: fitTa, watch: kbWatch },
    probe: probeDump,
    /* 搜索匹配的纯函数：跨行 / 标点全半角这些坑全靠它，暴露出来好单独验 */
    find: { ranges: findRanges, tight: tightMap },
    diag: diagOpen,                                              /* 排查用：直接弹自检卡 */
    diagText: diagBuild,
    /* 我们自己的代码在文档里的行号区间 —— 用来判断一个错是不是我们的。
       测试里要伪造「我们自己的错」，就靠这个造出真实的行号。 */
    ownRange: function () { return { file: OWN_FILE, lo: OWN_LO, hi: OWN_HI }; },
    bootState: function () {
      return { step: bootStep, fail: bootFail.slice(), ok: bootOK, err: lastErr };
    },
    reorder: function (seq) { pSort = true; pReorderSeq(seq); },   /* 测试用：直接驱动拖动结果 */
    /* 顺序自检（v2.4）：判「两堆」的纯函数 / 提示条 / 快照 / 一键还原，测试直接驱动 */
    ord: {
      grouped: ordIsGrouped,
      bar: function () { return ordBarHTML(); },
      fix: ordFixRun,
      snapGet: ordSnapGet,
      snapPut: ordSnapPut,
      warn: function () { return ordWarn; },
      setWarn: function (v) { ordWarn = v; }
    },
    /* 悬浮球摆位：测试要能直接驱动「默认归中 / 小窗钳回可视区」，
       不用重新跑 orbInit（那会重复绑事件）。 */
    orb: { center: orbCenter, clamp: orbClamp, userPos: orbUserPos },
    /* 消息截图：测试 / 排查用（cfg 直接可改，apply 手动重挂）
       ★ 纯函数也暴露出来 —— 卡死那次就是渲染引擎的锅，
         这些（上限算法 / 清理 / SVG 生成）必须能在 jsdom 里单独验，不能只能靠真机试。 */
    shot: {
      cfg: shotCfg, apply: function () { if (pwin && pwin.SillyTavern) shotApply(); },
      scale: shotScale, clean: shotClean, buildSVG: shotBuildSVG,
      mesText: shotMesText, who: shotWho, css: SHOT_CSS,
      /* v2.2：shadow 展开 + DOM 诊断（柏宝绘那类影子盒子不搬出来就永远是 0 张图） */
      shadow: shotShadowInline, dump: shotDomDump,
      /* v2.5：图标列摆位（贴底 + 避开酒馆那排按钮）—— 给测试直接驱动，不用造真机 */
      place: shotOpsPlace,
      /* v1.8：签名多了 mes（要用原节点的真实尺寸锁图宽高）；两参老调法照样能用 */
      inline: function (a, b, c) {
        return (typeof b === "function") ? shotInline(null, a, b) : shotInline(a, b, c);
      },
      imgMax: function () { return SHOT_IMG_MAX; },
      /* 上限常量也露出来：测试断言别写死数字，写死了以后调参就是一片红 */
      maxpx: SHOT_MAXPX, maxside: SHOT_MAXSIDE, maxb: SHOT_MAXB,
      scan: shotScan, rescan: shotRescan, watch: shotWatch, tick: shotTick,
      /* 2026-11-13「只挂看得见的几条」：nearN 是常驻条数，near 手动触发一次，
         scrollOn 看滚动监听有没有挂上（装盘后排查「滑了没图标」先看这个）。 */
      near: function (el) { return el ? shotNear(el) : shotNear(); },
      nearN: function () { return SHOT_NEAR; },
      scrollOn: function () { return !!shotState.scRoll; },
      nearDrop: function () { return shotState.nearDrop; },
      logs: shotLogs, logText: shotLogText, log: shotLog, env: shotEnvDump,
      canURL: shotCanURL, svgSrc: shotSvgSrc, href: shotHref
    },
    /* 收藏：测试 / 排查用（cfg 直接改，toggle 直接驱动，md 纯函数单独验） */
    fav: {
      cfg: favCfg, all: favAll, keys: favKeys, toggle: favToggle, md: favMD,
      keyOf: favKeyOf, ctx: favCtx, time: favTimeTx, push: favPush,
      clear: function () { favStore([]); favSaveCfg(); },
      save: favStore, exp: favExport, md2: favMD, render: renderFav, apply: function () { if (pwin && pwin.SillyTavern) shotApply(); },
      /* 阅读页：点一行进来 / 翻页 / 删除，测试直接驱动，不用猜 DOM 顺序 */
      read: function (i) { favReadOpen(i); }, readNav: favReadNav, readDel: favReadDel,
      readIdx: function () { return favReadIdx; },
      /* 分组 / 折叠 / 改名 / 标签（2026-11-13 按角色重做后加的） */
      groups: favGroups, groupOf: favGroupName, openOf: favOpenOf,
      toggle: favToggleGroup, more: favMoreGroup,
      rename: favRename, tagAdd: favTagAdd, tagDel: favTagDel, day: favDayTx,
      openClear: function () { _favOpen = {}; try { lsSetJSON(FAV_OPEN_K, {}); } catch (e) {} }
    },
    /* 关于 / 更新：版本比较是纯函数，单独验；检查与安装要能注入「假网络」，
       不然测试只能靠真连 GitHub（断网就一片红）。 */
    upd: {
      state: function () { return updSt; },
      cmp: vcmp, check: updCheck, install: updInstall, rollback: updRollback,
      entry: pmEntry, bak: updBak, raw: PM_RAW,
      setSt: function (o) { updSt = o; }
    }
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
  /* ★ 初始态就在【正中间】。不用 transform 居中：.orb:active 会覆盖 transform，
     按下那一瞬球会跳回角上；而且启动后 orbCenter() 写死的是绝对 left/top，
     translate(-50%) 反而会把球推偏。 */
  position:fixed; left:calc(50% - 22px); top:calc(50% - 22px);
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
  display:flex;align-items:center;gap:6px;padding:8px 10px;flex:none;
  border-bottom:1px solid var(--line2); background:var(--hdgrad);
  cursor:move; touch-action:none; position:relative;
  /* ★ 只作兜底：正常情况一行放得下（算过账，见 .nav 那条），
     万一屏幕窄到真放不下，换行让导航掉到第一行，总比溢出把图标挤出去强。
     row-gap 给 5px —— 换行时两行不会散得太开。 */
  flex-wrap:wrap;row-gap:5px;
}
.hd::after{
  content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(168,135,58,.34),transparent);
}
.hd .dot{width:6px;height:6px;border-radius:50%;background:var(--goldgrad);flex:none;box-shadow:0 0 0 3px var(--goldsoft)}
/* ★★ 预设名必须写成 flex:1 1 0 —— 这是顶栏能守住一行的关键。
   上一版写成 flex:0 1 96px 就翻车了：flex-wrap 判定换行用的是【元素的初始宽度】，
   不是压缩后的宽度。96px 的初始宽让累计到 427.5px ＞ 可用 412px，
   浏览器不等收缩就直接把最后一个（关闭按钮）甩到第二行 ——
   他看到的就是「上面一栏、下面孤零零一个叉」。
   改成 basis 0：换行判定时它占 0，剩余空间再靠 grow 全给它。 */
.hd .nm{font-size:10.5px;color:var(--ink3);flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 顶栏里这个 grow 不再撑开 —— 剩余空间全留给预设名，
   否则它俩平分，预设名只剩一半宽、中间还裂一道空。 */
.hd .grow{flex:0}
/* ── 预设切换小框 ──
   不用酒馆自己的预设界面，直接在这个脚本里点一下就列出全部预设。
   位置：预设名右边。窄屏时预设名会被藏掉（.hd .nm{display:none}），
   那时按钮自己带上当前预设名，不然就不知道自己在哪个预设里。 */
/* ★ 纯图标小按钮（用户实测：带名字太长，把关闭按钮挤没了） */
.psw{
  flex:none;width:25px;height:25px;padding:0;border-radius:8px;
  border:1px solid var(--line);background:var(--paper);color:var(--ink3);
  display:flex;align-items:center;justify-content:center;cursor:pointer;
  transition:.18s;box-shadow:var(--shsm);
}
.psw:hover{color:#fff;border-color:transparent;background:var(--goldgrad);box-shadow:0 2px 8px var(--ring)}
.psw svg{width:13px;height:13px}
/* 预设切换列表：摆在弹窗（.dlg .dm）里。
   弹窗本身宽度 min(320px, 100vw-40px)，列表给它一个内滚区，预设再多也撑不爆屏幕 */
/* 里面的长清单（预设切换列表 / 自检卡原始信息）：
   ⚠ 别写 vh —— 同一个坑。兜底值给死，真实值由 dlgFit 按可见区算出来再覆盖。 */
.dlg .plist{max-height:200px;overflow-y:auto;overscroll-behavior:contain;margin:0 -4px}
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
  width:25px;height:25px;flex:none;border-radius:8px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink2);display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:.18s;box-shadow:var(--shsm);
}
.ico:hover,.ico.on{color:#fff;border-color:transparent;background:var(--goldgrad);box-shadow:0 2px 8px var(--ring)}
.ico svg{width:13px;height:13px}
/* ── 页签：现在七个挤在顶栏一行里 ──
   ★ 2026-11-03 加到五个（多了「截图」）后挤爆顶栏，我先让导航独占一行 ——
     他看了一眼就否了：「占地方了，做小一点，挪上去，像之前那样」。
   ★ 2026-11-13 加到七个（多了「收藏」「关于」）：按同样的口径重算，
     按钮内距 5 → 4（七个省 14px）、字号仍 10.5，导航 ≈ 235，固定合计 ≈ 377，
     432 宽的顶栏里还剩 55px 给预设名 —— 紧，但一行放得下。
     ⚠ 再想加页签就必须先腾地方（缩字号或把某个页签并进别的页），别硬塞：
       .hd 是 flex-wrap:wrap，放不下不会报错，只会把导航折到第二行，他看着就是「又占地方了」。 */
.nav{flex:0 1 auto;min-width:0;display:flex;gap:2px;padding:2px;
  border-radius:9px;background:var(--paper3);box-shadow:var(--inssh)}
.nav button{
  flex:0 1 auto;min-width:0;text-align:center;
  border:0;background:transparent;color:var(--ink2);padding:3px 4px;font-size:10.5px;
  cursor:pointer;font-family:inherit;border-radius:7px;line-height:1.5;transition:.18s;letter-spacing:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
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
.find{display:none;padding:7px 12px;flex:none;align-items:flex-end;gap:7px;border-bottom:1px solid var(--line2);background:var(--paper2)}
.find.on{display:flex}
.find .fg{width:15px;height:15px;flex:none;color:var(--ink3);display:flex;align-items:center;justify-content:center;margin-bottom:7px}
.find .fg svg{width:15px;height:15px;display:block}
.find input,.find textarea{
  flex:1;min-width:0;padding:6px 10px;border-radius:9px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink);font:12.5px/1.5 inherit;outline:none;transition:.16s;
  box-sizing:border-box;
}
.find textarea{resize:none;overflow-y:auto;min-height:30px;max-height:56px;display:block}
.find input:focus,.find textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.find .fn{font-family:var(--mono);font-size:10.5px;color:var(--ink3);flex:none;white-space:nowrap;margin-bottom:7px}
.find .fx{width:22px;height:22px;flex:none;border-radius:7px;display:flex;align-items:center;justify-content:center;
  color:var(--ink3);cursor:pointer;transition:.16s;margin-bottom:7px}
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
.row.sub .nm{font-size:11px;color:var(--ink3);font-family:var(--mono);line-height:1.55;
  flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.row.sub .hits{flex:none;font:10px var(--mono);color:var(--goldD);padding-left:6px}
/* 「名」标：命中的是条目名而不是正文 —— 不加这个，名字高亮的行会让人以为正文也有了 */
.row .nm .nmhit{font-style:normal;font-size:9px;color:var(--goldD);border:1px solid var(--line);
  border-radius:5px;padding:0 3px;margin-left:4px;vertical-align:1px;background:var(--goldsoft)}
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
/* ★ 书内那行现在是「新建条目 + 归入[下拉] + 删除整本」三条挤一排，
   下拉不自己收缩的话，它一宽就把「删除整本」挤到第二行 —— 他要的是一栏。
   给它 flex:1 1 0（吃掉剩余）+ min-width（再挤也不塌）+ max-width（别贪太多）。 */
.wtool select{flex:1 1 0;min-width:52px;max-width:132px;padding:5px 7px;border-radius:9px;
  border:1px solid var(--line);background:var(--paper);color:var(--ink);font-size:11.5px;
  font-family:inherit;outline:none;cursor:pointer}
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
/* ★ 遮罩 / 弹窗的位置一律由 JS 实测写死（dlgFit），这里只给兜底值。
   ⚠ 绝不能再回到 inset:0 / top:50% / translate(-50%,-50%) / 100vw / vh ——
     脚本跑在酒馆助手的小 iframe 里，iframe 的视口跟你在屏幕上看到的那块不是一回事。
     真机 11-03：小窗口下 top:50% 算的是【iframe 高度的一半】→ 弹窗整个飘到上面去，
     铺满展开时 iframe 正好等于整屏，所以「展开就没事」。
     面板（placePanel）和全屏编辑页（sheetFit）早就是实测的，弹窗这里漏了同步。 */
.mask{position:fixed;left:0;top:0;width:100%;height:100%;background:rgba(24,18,10,.30);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  opacity:0;pointer-events:none;transition:opacity .2s;z-index:1200}
.mask.on{opacity:1;pointer-events:auto}
.dlg{
  position:fixed;left:0;top:0;transform:scale(.96);transform-origin:center center;z-index:1201;
  width:min(320px,calc(100vw - 40px));background:var(--card);border:1px solid var(--edge);
  box-shadow:0 0 0 1px var(--edge2),var(--sh),inset 0 1px 0 var(--hi);
  border-radius:18px;padding:16px 16px 14px;
  /* 只给 opacity / transform 做过渡：left/top/width/max-height 是 JS 实测写死的，
     带上过渡会在键盘弹起重算时看见弹窗慢悠悠滑一下。 */
  opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;
  /* 限高由 dlgFit 按可见区写死；里面的内容超了就自己滚，不许顶出屏幕 */
  overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
}
.dlg.on{opacity:1;transform:scale(1);pointer-events:auto}
.dlg .dt{font-size:13.5px;font-weight:700;margin-bottom:7px;letter-spacing:.2px}
.dlg .dm{font-size:12px;color:var(--ink2);line-height:1.7}
/* 自检卡里的原始信息：等宽、可滚、能整段选中复制 */
.dlg .dm pre{margin:8px 0 0;padding:9px 10px;white-space:pre-wrap;word-break:break-all;
  font:11px/1.65 var(--mono);color:var(--ink);background:var(--paper3);
  border:1px solid var(--line);border-radius:10px;max-height:200px;overflow:auto;
  -webkit-user-select:text;user-select:text;-webkit-text-size-adjust:100%;text-size-adjust:100%}
.dlg .db{display:flex;gap:8px;margin-top:14px}
.dlg .db .btn{flex:1}
/* ── 全屏编辑页 1100 ──
   手机上软键盘一弹，面板里那点行内小编辑框就被挤成一条缝 —— 编辑统一走这一整屏。
   顺序照你要的：**最上面是正文**，名字 / 角色 / 关键词钉在最底下（键盘上沿）。
   ⚠ 高度绝不用 vh / inset:0 —— 那量的是「地址栏收起时」的尺寸，比此刻可见的大。
      一律由视觉视口实测写死（sheetFit），键盘多高它都贴着键盘上沿。 */
.sheet{position:fixed;left:0;top:0;width:100%;height:100%;z-index:1100;display:none;
  flex-direction:column;background:var(--paper);
  /* 高度是实测写死的（键盘多高它就有多高）。小屏 + 键盘弹起 + 查找条摊开时，
     固定那几块加起来可能就超了 —— 以前 overflow:hidden 会把底下「名字 / 角色」栏
     直接裁掉看不见。改成纵向可滚兜底：正文先让，让到头还是不够就整页能滑。 */
  overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;
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
/* ★ 2026-11-13 他要求「条目编辑框上下更高」：上下内边距 10/8 → 6，左右 12 → 10，
   间距 8 → 7。正文框能多出 2~3 行。别再改回 12 —— 手机上一行就少几个字。
   ★ flex 从「1」(=1 1 0%) 改成「1 0 auto」：正文框有 min-height 44vh 的下限，
     这一块必须【不许被压扁】，压扁就会跟底栏叠在一起；高过可视区时由 .sheet 整体滚。 */
.sarea{flex:1 0 auto;min-height:0;padding:6px 10px 6px;display:flex;flex-direction:column;gap:7px}
/* 「正文」标签 + 快捷输入挤一行（各占一行的话正文框就被顶下去一截） */
.sarea .shead{display:flex;align-items:center;gap:7px;flex:none;min-width:0}
.sarea .shead .slb{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sarea .shead .macros{margin-top:0;flex:none;flex-wrap:nowrap}
.sarea .shead .macros .chip{padding:4px 9px;font-size:11px}
/* ── 编辑页里的查找 / 替换条（收起时只有一行，不抢正文的地方） ── */
/* 内边距跟 .sarea 的 10px 对齐：差 1px 看着就像两块拼上去的 */
.fbar{flex:none;padding:8px 10px;border-bottom:1px solid var(--line2);background:var(--paper2);
  display:flex;flex-direction:column;gap:6px}
.fbar.mini{flex-direction:row;align-items:center;gap:7px;cursor:pointer;padding:8px 10px}
.fbar.mini .fic{width:14px;height:14px;flex:none;color:var(--ink3);display:flex;align-items:center}
.fbar.mini .fic svg{width:14px;height:14px;display:block}
.fbar.mini .ft{font-size:11.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fbar.mini .ft b{color:var(--goldD);font-weight:700}
.fbar.mini .fopen{flex:none;font-size:10.5px;color:var(--goldD);border:1px solid var(--line);
  border-radius:8px;padding:2px 8px;background:var(--paper)}
/* ── 正文区（v1.6 定稿：只有一个输入框，没有「查看态」了）──────────────
   ★★ 他 2026-11-13 连着骂了两轮：「别搞那些高亮，进来就是编辑状态，卡得要死」。
      所以：查看态那层文字 + 真 <mark>、以及把选区刷成深金底的 ::selection 全部删除。
      现在点进条目 = 直接就是编辑框，能立刻打字，不再有「先看再点一下」那一步。
   ⚠ 别再把高亮捡回来：① 影子层 11-03 真机整体错位；② ::selection 重色不卡，
      但整套「进页面先全文 innerHTML 渲染 + mark」才是卡的地方，他明确不要。 ── */
/* ★★ 2026-11-13 修「点一下正文就从全屏变窄条」：
   点正文 → 切编辑态 → 键盘弹起 → sheetFit 按可见区重算，整页高度一下少掉键盘那截，
   而查找条（两行 textarea + 按钮行）和底栏（名字/角色）都是 flex:none 抢不走的高度，
   正文框作为唯一的 flex:1 就被压到只剩几十像素 —— 他看着就是「突然变成很窄的框」。
   他明确说了：查找条和底栏【都不要收】。所以不动那两块，改成给正文框钉一个下限。
   ★ 这里用 vh 是有意的：vh 量的就是「键盘没弹时的视口」= 一个不会随键盘变的基准，
     正好当「最少给我这么多行」的尺子。高度不够时由 .sheet 纵向滚动兜底（它本来就能滚）。 */
.tawrap{position:relative;flex:1;min-height:110px;min-width:0;display:flex}
/* 正文盒：整页唯一的那一个输入框 */
.tawrap textarea{
  flex:1;width:100%;min-height:0;box-sizing:border-box;
  padding:10px 10px;border:1px solid var(--line);border-radius:12px;
  background:var(--paper2);color:var(--ink);
  font:13px/1.8 var(--mono);
  -webkit-text-size-adjust:100%;text-size-adjust:100%;
  overflow-y:auto;-webkit-overflow-scrolling:touch;
  white-space:pre-wrap;word-break:normal;overflow-wrap:break-word;
  margin:0}
.tawrap textarea{resize:none;outline:none;display:block}
.tawrap textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.fbar .frow{display:flex;align-items:flex-start;gap:6px}
.fbar .flb{flex:none;width:28px;font-size:10.5px;color:var(--ink3);padding-top:7px}
.fbar .frow textarea{flex:1;min-width:0;padding:5px 9px;border-radius:8px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink);font:12px/1.5 inherit;outline:none;resize:none;
  overflow-y:auto;min-height:30px;max-height:52px;box-sizing:border-box}
.fbar .frow textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.fbar .fnav{flex:none;display:flex;align-items:center;gap:2px;padding-top:4px}
.fbar .fnav b{width:22px;height:24px;display:flex;align-items:center;justify-content:center;
  border-radius:7px;border:1px solid var(--line);background:var(--paper);color:var(--ink2);
  font-size:14px;line-height:1;cursor:pointer;font-weight:400}
.fbar .fnav b:active{background:var(--goldgrad);color:#fff;border-color:transparent}
.fbar .fnav i{font:10.5px var(--mono);color:var(--ink3);min-width:32px;text-align:center;font-style:normal}
/* 正文没中、名字里中了：计数那个位置变成「名字 N」，点一下跳到名字框 */
.fbar .fnav i.nm{color:var(--goldD);cursor:pointer;font-weight:700;text-decoration:underline dotted}
.fbar .fbtn{display:flex;align-items:center;gap:7px}
.fbar .chip.off{opacity:.42;pointer-events:none}
.fbar .chip.undo{opacity:.4;pointer-events:none}
.fbar .chip.undo.can{opacity:1;pointer-events:auto;color:var(--goldD);border-color:var(--gold)}
/* ── 命中的字怎么「看得见」（2026-11-13 他拍板）──
   ★ 他要的不是变色，是「选中的那段必须加重、必须跟周围不一样」，
     就是手机长按选字那种选中态。所以两件事：
       ① 跳转时真的把焦点交给输入框 —— 失焦的选区手机上根本不画，
          以前写的「只设选区不 focus，反正能看到」是错的，等于什么都没显示；
       ② 选中态刷成深金底 + 深字（系统默认那层淡蓝，在这种小字上几乎看不出来）。
   ★ 之前加过的「命中预览条」他明确说多余，已整段删掉，查找条恢复干净。 */
/* 列表底部的「整体替换」条 */
.bulkbar{display:flex;align-items:center;gap:8px;padding:8px 12px;flex:none;
  border-top:1px solid var(--line2);background:var(--paper2)}
.bulkbar .bt{font-size:11px;color:var(--ink3)}
.bulkbar .bt b{color:var(--goldD);font-family:var(--mono)}
/* ── 截图设置页（面板第五个页签）──
   ★ 不另起一套：整体沿用导出页那套 .exwrap / .exlb1 / .exseg / .exb / .exhint，
     只有「清晰度滑条」是这里独有的，单开一条样式。之前自己造了 .shotbox 一整套，
     跟别的页签放在一起就是两个世界的样子（他原话：比较生硬）。 */
/* 清晰度滑条：轨道细、热区高（手机上 4px 的轨道根本按不准） */
.sld{flex:1;min-width:0;-webkit-appearance:none;appearance:none;width:100%;
  height:26px;background:transparent;outline:none;margin:0;cursor:pointer}
.sld::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:var(--line)}
.sld::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;
  border-radius:50%;background:var(--goldgrad);border:none;box-shadow:0 1px 5px var(--ring);
  margin-top:-8px}
.sld::-moz-range-track{height:4px;border-radius:2px;background:var(--line)}
.sld::-moz-range-thumb{width:20px;height:20px;border-radius:50%;
  background:#c9a765;border:none;box-shadow:0 1px 5px var(--ring)}
.sv{flex:none;min-width:38px;text-align:right;font:11.5px var(--mono);color:var(--goldD);font-weight:700}
.exrow.sliderow{display:flex;align-items:center;gap:10px}
.exhint b{color:var(--goldD)}
/* 整体替换弹窗：两组分类（改哪里 / 改哪些） */
.bk{display:flex;flex-direction:column;gap:8px}
.bk .bkr{display:flex;align-items:flex-start;gap:7px}
.bk .bklb{flex:none;width:40px;font-size:10.5px;color:var(--ink3);padding-top:6px}
.bk .bkq{flex:1;min-width:0;font-size:12px;color:var(--ink2);padding:5px 9px;border-radius:8px;
  background:var(--goldsoft);border:1px solid var(--line);max-height:52px;overflow:auto;
  white-space:pre-wrap;word-break:break-all}
.bk textarea{flex:1;min-width:0;padding:6px 9px;border-radius:8px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink);font:12px/1.5 inherit;outline:none;resize:none;
  min-height:34px;max-height:64px;box-sizing:border-box}
.bk textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.bk .seg{display:flex;gap:5px;flex:1;flex-wrap:wrap}
.bk .seg b{font-size:11.5px;font-weight:400;color:var(--ink2);padding:5px 10px;border-radius:9px;
  border:1px solid var(--line);background:var(--paper);cursor:pointer;user-select:none}
.bk .seg b.on{background:var(--goldgrad);color:#fff;border-color:transparent;font-weight:700;
  box-shadow:0 2px 8px var(--ring)}
.bk .bktip{font-size:10.5px;color:var(--ink3);line-height:1.7;padding-top:2px}
.bk .bktip b{color:var(--goldD);font-family:var(--mono)}
/* 正文框：用户 10-27 反馈太小 → min-height 110 加大到 170（全屏页剩的高度全是它的）
   ★ 只管「直接挂在 .sarea 下」的那种（世界书 / 正则编辑页）。
     预设编辑页的正文框包在 .tawrap 里（查看/编辑两态共用的壳）——
     它的高度由 .tawrap 的 flex 决定，那条 min-height:170px 一旦落到它头上，
     手机上一开查找条它就把整页撑破、把底下「名字 / 角色」栏挤没。 */
.sarea>textarea{flex:1;width:100%;min-height:170px;resize:none;outline:none;
  padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--paper2);
  color:var(--ink);font:13px/1.8 var(--mono);-webkit-text-size-adjust:100%}
.sarea>textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px var(--ring)}
.sarea>textarea.half{flex:none;height:96px;min-height:70px}
.slb{font-size:10.5px;color:var(--ink3);letter-spacing:.5px;flex:none}
/* 底栏：名字 / 角色 / 关键词 / 计数 —— 钉死在键盘上沿
   ★ 2026-11-13：上下 9 → 7、左右 12 → 10（他说编辑框要更高，这几像素就是白给正文的） */
.sft{flex:none;padding:7px 10px calc(7px + env(safe-area-inset-bottom));
  border-top:1px solid var(--line2);background:var(--paper2);
  display:flex;flex-direction:column;gap:6px}
.srow{display:flex;align-items:center;gap:8px}
.srow>.lb{flex:none;width:34px;font-size:10.5px;color:var(--ink3)}
/* ── 底栏收起态（v2.5）────────────────────────────────────────────
   他 2026-11-14 定：「名字/角色收成一条，点开才显」—— 因为正文框要一直撑到键盘上沿。
   ⚠ 收起时这一条必须【矮】：它是正文框唯一的对手，这里多 10px 正文就少 10px。 */
.sft.fold .ftb{display:none}
.sft.fold{padding-top:5px;padding-bottom:calc(4px + env(safe-area-inset-bottom))}
.sft .ftg{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;
  min-width:0;padding:5px 8px;border-radius:9px;border:1px solid var(--line);
  background:var(--paper);color:var(--ink);font:12px/1.4 inherit;text-align:left;cursor:pointer}
.sft .ftg:active{background:var(--paper3)}
.sft .ftg .grow{flex:1}
.sft .ftg .ftk{flex:none;font-size:10.5px;color:var(--ink3)}
.sft .ftg .ftv{flex:0 1 auto;min-width:0;max-width:42%;font-weight:600;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sft .ftg .ftw{max-width:26%;font-weight:500;color:var(--ink2)}
.sft .ftg .ftx{flex:none;font-size:10.5px;color:var(--ink3);
  border:1px solid var(--line);border-radius:7px;padding:1px 6px;background:var(--paper2)}
.sft input,.sft select{flex:1;min-width:0;padding:7px 10px;border-radius:11px;
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
/* 顺序自检条（v2.4）：预设顺序表被打成「开着的全在前、关着的全在后」时提醒。
   用金色不用红色 —— 这不是数据坏了，是顺序被重排了，条目一条都没少。 */
.ordbar{border-color:rgba(186,117,23,.45);background:rgba(186,117,23,.10);
  color:var(--goldD);cursor:default}
.ordbar .chip{flex:none;cursor:pointer;font-size:11px;padding:3px 9px;border-radius:8px;
  border:1px solid rgba(186,117,23,.45);color:var(--goldD);background:rgba(255,255,255,.55)}
.ordbar .x{flex:none;cursor:pointer}
/* toast 1300 */
/* toast 1300 —— 位置同样由 JS 实测写死（toastFit），理由同弹窗：
   bottom:calc(72px+…) 量的是 iframe / 地址栏收起时的视口，小窗口下会飘。 */
.toast{
  position:fixed;left:0;top:0;z-index:1300;
  transform:translateY(8px);padding:9px 15px;border-radius:12px;
  background:linear-gradient(135deg,#2f2a22,#221d17);color:#fdf8ee;font-size:12px;
  border:1px solid rgba(223,200,148,.28);box-shadow:0 12px 28px rgba(0,0,0,.28),
    inset 0 1px 0 rgba(255,255,255,.10);
  opacity:0;pointer-events:none;transition:opacity .24s cubic-bezier(.3,1.2,.5,1),transform .24s;
  max-width:78vw;text-align:center;letter-spacing:.2px;
}
.toast.on{opacity:.97;transform:none}
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
/* 出图记录：截图是异步 + 手机环境杂，报错一闪而过根本抓不住 —— 记在这儿，能翻能复制 */
.sklog{max-height:132px;overflow:auto;padding:7px 9px;border-radius:10px;border:1px solid var(--line);
  background:var(--paper);margin-top:2px}
.sklogrow{font:10.5px/1.6 var(--mono);color:var(--ink2);word-break:break-all;padding:1px 0}
.sklogrow.dim{color:var(--ink3)}
/* ── 收藏（面板第六页 + 全屏勾选页） ──
   样式跟导出 / 截图那两页共用 .exwrap / .exlb1 / .exseg / .exb / .exhint，
   只有「条目列表」和「勾选列表」是这里独有的，别自己再造一套面板皮。 */
/* ── 收藏 · 按角色分组（2026-11-13 v1.0 重做，对照 _preview_fav.html） ──
   结构：角色块（可折叠）→ 条目（自起的名字 + 存的时间 + 标签）→ 点进全屏阅读页。
   ★ 他定的三条（都不是我猜的）：① 顶部那排标签筛选**不要**，只按角色分
     ② 默认**全部折叠** ③ 展开过哪几个要**记住**（关掉重开还在，各记各的）。
   ★ 展开先露 4 条：块头 50 + 四条 210 + 「还有 N 条」30 ≈ 290px，
     一个块最多占屏幕三分之一，展开两三个还能看见下面有谁。数字别随手加大。 */
.fvwrap{display:flex;flex-direction:column;gap:9px;padding:2px 0 6px}
.fvg{background:var(--card);border:1px solid var(--line);border-radius:16px;
  overflow:hidden;box-shadow:var(--shsm)}
.fvgh{display:flex;align-items:center;gap:9px;padding:12px 13px;
  cursor:pointer;user-select:none;-webkit-user-select:none}
.fvgh:active{background:var(--paper2)}
.fvga{width:26px;height:26px;border-radius:9px;flex:none;display:flex;align-items:center;
  justify-content:center;font-size:12px;font-weight:700;color:#fff;
  background:var(--goldgrad);box-shadow:inset 0 1px 0 rgba(255,255,255,.35)}
.fvgn{flex:1;min-width:0;font-size:14px;font-weight:700;color:var(--ink);
  letter-spacing:.2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fvgc{flex:none;font:11px var(--mono);color:var(--ink3)}
.fvgar{flex:none;width:14px;height:14px;color:var(--ink3);transition:transform .24s}
.fvg.on .fvgar{transform:rotate(90deg)}
.fvgl{display:none;border-top:1px solid var(--line2);padding:4px 6px 7px}
.fvg.on .fvgl{display:block}
/* 条目：名字打头，没名字就用正文第一句（.none 灰一点，一眼能认出还没命名） */
.fvi{padding:9px 8px;border-radius:11px;cursor:pointer}
.fvi:active{background:var(--paper3)}
.fvit{display:flex;align-items:baseline;gap:7px}
.fvin{flex:1;min-width:0;font-size:13px;font-weight:700;color:var(--ink);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fvin.none{color:var(--ink3);font-weight:400}
.fvid{flex:none;font:10.5px var(--mono);color:var(--ink3);white-space:nowrap}
.fvip{margin-top:3px;font-size:11.5px;line-height:1.55;color:var(--ink2);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fvitag{display:flex;gap:4px;margin-top:5px;flex-wrap:wrap}
.fvtag{font-size:10px;padding:2px 6px;border-radius:6px;background:var(--goldsoft);
  color:var(--gold);border:1px solid var(--goldL);line-height:1.5;white-space:nowrap}
.fvmore{display:block;width:100%;border:0;background:transparent;color:var(--gold);
  font:inherit;font-size:11.5px;font-weight:700;padding:9px 0 5px;cursor:pointer;
  border-radius:9px;letter-spacing:.2px;line-height:1.4}
.fvmore:active{background:var(--paper3)}
/* 全屏勾选页：列表自己滚，底下的「收藏选中」钉在键盘上沿 */
.sarea.fcarea{flex:1 1 auto;min-height:0}
.fvpicks{flex:1;min-height:0;overflow:auto;border:1px solid var(--line);border-radius:12px;
  background:var(--paper2)}
.fvpick{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;
  border-bottom:1px solid var(--line2);cursor:pointer}
.fvpick:active{background:var(--paper3)}
.fvpick .bx{flex:none;width:20px;height:20px;border-radius:6px;border:1px solid var(--line);
  background:var(--paper);display:flex;align-items:center;justify-content:center;color:#fff}
.fvpick.on .bx{background:var(--goldgrad);border-color:transparent}
.fvpick .bx svg{width:12px;height:12px}
.fvpick .pi{flex:1;min-width:0}
.fvpick .pw{font-size:12px;color:var(--ink);display:flex;gap:6px;align-items:baseline}
.fvpick .dd{font-size:10px;color:var(--goldD);font-style:normal;border:1px solid var(--line);
  border-radius:6px;padding:0 4px}
.fvpick .pt{display:block;font-size:11px;color:var(--ink3);line-height:1.55;margin-top:2px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* ── 收藏 · 全屏阅读页（sheetShow("fr")） ──
   ★ 外壳直接用 #sheet（高度由 sheetFit 按 visualViewport 实测写死），
     这里只管「正文能读、能选字、能翻条」。禁用 vh —— 手机地址栏一变就溢出。
   ★ 字号给 14.5 / 行高 1.9：他要的是「能看」，不是后台编辑器那种小字。 */
.frdw{display:flex;flex-direction:column;height:100%;min-height:0;flex:1 1 auto}
.frd{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;
  padding:14px 14px 22px;background:var(--paper);
  -webkit-user-select:text;user-select:text}
.frdm{font:11px/1.7 var(--mono);color:var(--ink3);padding-bottom:9px;
  border-bottom:1px dashed var(--line2);margin-bottom:12px;word-break:break-word}
.frdt{font-size:14.5px;line-height:1.9;color:var(--ink);
  white-space:pre-wrap;word-break:break-word;word-wrap:break-word}
.frdc{margin-top:14px;font-size:11px;color:var(--ink3)}
.frdb{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  padding:9px 12px calc(9px + env(safe-area-inset-bottom));
  border-top:1px solid var(--line2);background:var(--paper2)}
.frdb .btn{flex:none;padding:7px 12px;font-size:12px}
.frdn{flex:1;text-align:center;font:11px var(--mono);color:var(--ink3);white-space:nowrap}
/* 阅读页标题：没起名字时灰一点，一眼看出「这条还没命名」 */
.shd .tit.none{color:var(--ink3);font-weight:400}
/* 阅读页的标签行：夹在正文和底部按钮之间；标签上的 × 直接去掉这个标签 */
.fvrdt{flex:none;display:flex;align-items:center;gap:5px;flex-wrap:wrap;
  padding:8px 12px;border-top:1px solid var(--line2);background:var(--card)}
.fvrdt .fvtag{padding-right:16px;position:relative}
.fvrdt .fvtag i{position:absolute;right:3px;top:50%;transform:translateY(-50%);
  font-style:normal;font-size:11px;color:var(--goldL);cursor:pointer;padding:2px;line-height:1}
.fvadd{border:1px dashed var(--line);background:transparent;color:var(--ink3);
  font:inherit;font-size:10.5px;padding:3px 8px;border-radius:7px;cursor:pointer;line-height:1.5}
.fvadd:active{background:var(--paper3)}
/* 弹窗里的单行输入框（改名 / 加标签用，见 askInput） */
.dlg .askin{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px 11px;
  border-radius:11px;border:1px solid var(--line);background:var(--paper);color:var(--ink);
  font:13px/1.5 inherit;outline:none}
.dlg .askin:focus{border-color:var(--goldL)}
/* 关于 / 更新页：版本号给足字号，更新日志用一个可滚的小框（别撑高整页） */
.abver{font:700 15px/1.5 var(--mono);color:var(--ink);letter-spacing:.4px}
.abver i{font:400 10.5px var(--mono);color:var(--ink3);font-style:normal;margin-left:6px}
.ablog{max-height:190px;overflow:auto;padding:8px 10px;border-radius:10px;
  border:1px solid var(--line);background:var(--paper);margin-top:2px}
.ablog div{font-size:11px;line-height:1.75;color:var(--ink2);padding:1px 0;word-break:break-word}
.ablog div.k{color:var(--goldD);font-weight:700}
.ablog div.d{color:var(--ink3)}
.abst{font-size:11px;line-height:1.7;color:var(--ink2);margin-top:2px;word-break:break-word}
.abst.bad{color:var(--red)}
.fvpick.has{opacity:.72}
/* 勾选页底部那颗「收藏选中的 N 条」：手指好按 */
.sft .srow .btn{flex:1;padding:10px 12px;font-size:13px}
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
  /* ★ 2026-11-13 七个页签（多了「收藏」「关于」）后按 375 屏重算：
     面板 = 100vw-12 = 363，可用 343；
     导航 = 字 15×10=150 + 内距 3×2×7=42 + gap 1×6=6 + 外框 4 = 202
     固定 = 圆点 6 + 导航 202 + 图标 22×4=88 + 间距 5×8=40 = 336 ≤ 343 ✓
     ⚠ 六个页签时这档是「字号 10.5 + 图标 25」，七个塞不下 —— 别改回去。 */
  .hd{gap:5px}
  .ico,.psw{width:22px;height:22px}
  .nav{gap:1px}
  .nav button{padding:3px 3px;font-size:10px}
  /* 「正文 · 这条就是要发给 AI 的东西」这行标签在窄屏会被三个快捷输入按钮挤成省略号，
     反正是装饰说明 —— 窄屏直接让位给按钮 */
  .sarea .shead .slb{display:none}
  .sarea .shead{gap:0}
  .entrow{padding-left:11px} .brow{padding-left:11px} .rxrow{padding-left:16px}
  .rxrow .l2{padding-left:39px}
}
/* ★ 极窄屏兜底（320~360 这类小手机）：面板只有 100vw-12 ≈ 308，可用 292，
   而一行固定宽 336 —— 再收顶栏间距（5→4）与图标（22→20），
   → 6 + 202 + 80 + 32 = 320，仍差 28：靠 .hd 的 flex-wrap 兜回两行，
   总比溢出把右侧图标挤出去强（320 屏现在很少了，不为它牺牲 360 屏的字号）。 */
@media (max-width:360px){
  .hd{gap:4px;padding:7px 8px}
  .ico,.psw{width:20px;height:20px}
  .nav button{padding:3px 3px;font-size:10px}
  .nav{gap:1px}
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
        '<button data-v="shot">截图</button>' +
        '<button data-v="fav">收藏</button>' +
        '<button data-v="about">关于</button>' +
      '</span>' +
      '<span class="nm" id="pname"></span>'
      +       '<button class="psw" id="pSwap" title="切换酒馆预设">' + SV.swap + '</button>'
      + '<span class="grow"></span>' +
      '<span class="ico" id="pFind" title="搜索：条目名 / 内容">' + SV.find + '</span>' +
      '<span class="ico" id="pNight" title="夜间 / 日间">' + SV.night + '</span>' +
      '<span class="ico" id="pClose" title="收起">' + SV.close + '</span>' +
    '</div>' +
    '<div class="stat" id="statRow">' +
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
      /* ⚠ 必须是 textarea：user 要粘整段话去搜，input 会当场把换行吃掉 */
      + '<textarea id="finp" rows="1" spellcheck="false" wrap="soft" placeholder="搜条目名 / 正文，整段也行"></textarea>'
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
/* 用户有没有亲手拖过球 —— 只有拖过才认记忆位置，没拖过一律正中间。
   抽成函数：启动 / 钳制 / 测试共用一处口径，免得两边判断不一致。 */
function orbUserPos() { return ls("posuser", "0") === "1"; }
function orbPlace(el, x, y, edge) {
  el.style.left = x + "px"; el.style.top = y + "px";
  el.style.right = "auto"; el.style.bottom = "auto";
  lsSet("pos", Math.round(x) + "," + Math.round(y));
  if (edge !== undefined) lsSet("edge", edge || "");
}
/* ★ 11-04 默认位改成【屏幕正中间】（水平 + 垂直都居中）。
   他要的是「小窗口状态下也一定找得到」：以前是底边居中 + 左右贴边吸附，
   球被拖到边上后坐标写进记忆，小窗一缩窄就直接跑到可视区外，整屏都找不着。
   正中间是任何窗口尺寸下都看得见的位置；之后他自己拖，拖过才记（见 orbInit）。 */
function orbCenter(el) {
  var R = vpRect();
  if (!R.h) return;
  var w = el.offsetWidth || 44, h = el.offsetHeight || 44;
  if (!w || !h) return;
  var x = Math.round(R.left + R.w / 2 - w / 2);
  var y = Math.round(R.top + R.h / 2 - h / 2);
  orbPlace(el, Math.max(R.left + 4, Math.min(x, R.left + R.w - w - 4)),
               Math.max(R.top + 4, Math.min(y, R.top + R.h - h - 4)), "c");
}
/* 把跑出屏幕的球拽回来：键盘弹出、地址栏收放、转屏都会让它跑丢 */
function orbClamp() {
  var el = QI("orb"); if (!el) return;
  var R = vpRect(); if (!R.h) return;
  var w = el.offsetWidth || 44, h = el.offsetHeight || 44;
  var L = parseFloat(el.style.left || ""), T = parseFloat(el.style.top || "");
  var userPos = orbUserPos();
  /* 还没摆过（比如球刚创建、CSS 默认位）→ 直接按实测视口摆正中间，
     别再靠 getBoundingClientRect 慢慢核：小窗口下它量到的还是旧 layout viewport。 */
  if (!isFinite(L) || !isFinite(T)) { orbCenter(el); return; }
  var ed = ls("edge", "");
  var minT = R.top + 6, maxT = R.top + R.h - h - 6; if (maxT < minT) maxT = minT;
  var minL = R.left + 6, maxL = R.left + R.w - w - 6; if (maxL < minL) maxL = minL;
  var nT, nL;
  if (!userPos) {
    /* 默认位：小窗 / 转屏 / 键盘顶起，一律重新摆回正中间 */
    nL = Math.round(R.left + R.w / 2 - w / 2);
    nT = Math.round(R.top + R.h / 2 - h / 2);
  } else {
    /* 用户拖过：位置归他管，但★绝不允许跑出可视区★ ——
       以前贴边（l/r）故意不钳 x，小窗口一缩窄球就整颗跑没影了。 */
    nT = T;
    nL = (ed === "c") ? Math.round(R.left + R.w / 2 - w / 2) : L;
  }
  nL = Math.max(minL, Math.min(nL, maxL));
  nT = Math.max(minT, Math.min(nT, maxT));
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
      if (dlgIsOn()) dlgFit();              /* 弹窗同理：键盘一顶，可见区就变了 */
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
  /* 略微偏上一点点（纯视觉）。球现在默认也在正中央，面板层级更高会盖住它，
     关掉面板球就露出来 —— 那是正常的，别再为它让位、也别当成「球不见了」。 */
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
  toastFit(t);                       /* 先按可见区摆好，再让它显形 */
  clearTimeout(toastH); toastH = setTimeout(function () { t.classList.remove("on"); }, 2400);
}
/* toast 摆位：底部居中（球现在在正中央，不必再给它留位置） */
function toastFit(t) {
  var R = vpRect(); if (!R.w || !R.h) return;
  var maxW = Math.max(160, Math.round(R.w * 0.78));
  t.style.maxWidth = maxW + "px";
  var w = t.offsetWidth || 200, h = t.offsetHeight || 34;
  var x = Math.round(R.left + R.w / 2 - w / 2);
  /* 离底一点，免得贴住系统手势条；可见区被键盘压扁时就别再坚持 72 了 */
  var bot = Math.min(72, Math.max(10, Math.round(R.h * 0.12)));
  var y = Math.round(R.top + R.h - h - bot);
  t.style.left = Math.max(R.left + 6, x) + "px";
  t.style.top = Math.max(R.top + 6, Math.min(y, R.top + R.h - h - 6)) + "px";
  t.style.bottom = "auto";
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

/* ── 弹窗摆位（2026-11-03 小窗口飘窗修的就是这里）──
   ★ 规矩跟面板 placePanel / 全屏页 sheetFit 一模一样：**全部按主窗口可见区实测写死**。
     以前是 CSS 居中（top:50%;translate(-50%,-50%)），而脚本跑在酒馆助手的小 iframe 里 ——
     那个 50% 是【iframe 高度的一半】，不是屏幕的一半。iframe 一小，弹窗就飘到上面去；
     铺满展开时 iframe 正好等于整屏，看着就「没事」。
     同一套雷还有：inset:0 的遮罩只盖住 iframe 那一小块、内容里的 46vh 按 iframe 算。
     所以三样（遮罩尺寸 / 弹窗坐标 / 内部清单限高）都由这个函数实测写出。 */
function dlgFit() {
  var m = QI("mask"), d = QI("dlg"); if (!m || !d) return;
  var R = vpRect(); if (!R.w || !R.h) return;

  /* 遮罩＝此刻真正看得见的那一块（inset:0 会按 iframe/地址栏收起时的尺寸算，比可见的大） */
  m.style.left = R.left + "px"; m.style.top = R.top + "px";
  m.style.width = R.w + "px";   m.style.height = R.h + "px";
  m.style.right = "auto"; m.style.bottom = "auto";

  var w = Math.min(320, R.w - 32);
  if (w < 180) w = Math.max(160, R.w - 12);          /* 窄到极致的兜底 */
  d.style.maxHeight = "";                             /* 先放开量一次真实高度 */
  var h = d.offsetHeight || 260;
  var maxH = Math.max(180, Math.min(R.h - 24, Math.round(R.h * 0.86)));
  if (h > maxH) h = maxH;

  var x = Math.round(R.left + R.w / 2 - w / 2);
  /* 略微偏上：跟面板一个道理 —— 底下给居中的球 / 键盘让点位置 */
  var y = Math.round(R.top + R.h / 2 - h / 2 - Math.min(24, R.h * 0.03));
  x = Math.max(R.left + 6, Math.min(x, R.left + R.w - w - 6));
  y = Math.max(R.top + 6, Math.min(y, R.top + R.h - h - 6));

  d.style.left = x + "px"; d.style.top = y + "px";
  d.style.width = w + "px"; d.style.maxHeight = maxH + "px";
  d.style.right = "auto"; d.style.bottom = "auto";
  d.style.transformOrigin = "center center";

  /* 里面的长清单：限高也按可见区算（46vh 在 iframe 里同样是骗人的） */
  var inner = Math.max(90, Math.round(maxH * 0.45));
  var rs = d.querySelectorAll(".plist, .dm pre");
  for (var i = 0; i < rs.length; i++) rs[i].style.maxHeight = inner + "px";
}
function dlgIsOn() { var d = QI("dlg"); return !!(d && d.classList.contains("on")); }
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
  /* ★ 先按可见区摆好坐标，再让它显形 —— 顺序反了会看见弹窗先飘一下再归位 */
  dlgFit();
  m.classList.add("on"); d.classList.add("on");
}
function dlgClose() {
  var m = QI("mask"), d = QI("dlg"); if (!m || !d) return;
  m.classList.remove("on"); d.classList.remove("on"); dlgYesCb = null; dlgRiskCb = null;
}

/* =====================================================================
   渲染
   ===================================================================== */
/* ★ 主角={{user}}、对方={{char}} —— 2026-11-03 他纠正的：之前俩标签装反了 */
var MACROS = [["user", "主角"], ["char", "对方"]];   /* 就这两个，多的不放 */
function macroRow(id, withCopy) {
  return '<div class="macros">' + MACROS.map(function (m) {
    return '<span class="chip" data-mc="{{' + m[0] + '}}" data-mct="' + id + '">'
      + m[1] + '<u>{{' + m[0] + '}}</u></span>';
  }).join("")
    + (withCopy ? '<span class="chip" data-pcopy="1" title="整条正文进剪贴板">复制<u>条目内容</u></span>' : "")
    + "</div>";
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
  if (findOn) { var i = QI("finp"); if (i) { try { i.focus(); } catch (e) {} autogrow(i, 56); } }
  else findSet("");
}
function findSet(v) {
  /* ⚠ 不再 toLowerCase：搜索词要按原样显示给人看（含整段句子）。
     大小写 / 空白 / 标点全半角这些差异，统一在 tightMap 里抹平。 */
  var nv = String(v == null ? "" : v).trim();
  if (nv === findQ) return;
  /* ⚠ 换搜索词之前先收口：列表马上要被过滤，正在编辑的那条很可能被滤掉，
     编辑器一消失，刚打的字就随风去了 —— finishEdit 会兜底先写回去 */
  finishEdit();
  findQ = nv;
  renderList();
}
function findClear() {
  var i = QI("finp"); if (i) { i.value = ""; autogrow(i, 56); }
  findSet("");
  if (i) { try { i.focus(); } catch (e) {} }
}

function render() { renderNav(); renderList(); updStat(false); }

function renderNav() {
  var bs = QI("nav").querySelectorAll("button");
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", bs[i].getAttribute("data-v") === view);
  var isP = view === "preset";
  /* 4 个「设置型」页签不搜索、不显示统计条、不显示说明行 —— 它们本来就没有条目列表 */
  var plain = (view === "regex" || view === "export" || view === "shot" || view === "fav" || view === "about");
  QI("tabs").style.display = isP ? "" : "none";
  QI("pFind").style.display = plain ? "none" : "";
  var statRow = QI("statRow");
  if (statRow) statRow.style.display = (view === "shot" || view === "fav" || view === "about") ? "none" : "";
  var pn = QI("pname");
  pn.textContent = isP ? presetName
    : view === "world" ? wbBooks.length + " 本世界书"
    : view === "export" ? "导出 / 备份"
    : view === "shot" ? "消息截图"
    : view === "fav" ? favAll().length + " 条收藏"
    : view === "about" ? "关于 / 更新"
    : rxAll().length + " 条正则";
  pn.title = pn.textContent;
  /* 预设切换小框：只在预设页出现（别的页签切预设没意义） */
  var sw = QI("pSwap");
  if (sw) {
    sw.style.display = isP ? "" : "none";
    sw.title = "切换酒馆预设（当前：" + presetName + "）";
  }
  QI("how").textContent = isP ? "" : (plain ? "" : ((view === "world" ? wbHow : rxHow) || ""));
}

/* ── A 预设 ──
   底部工具行（在条目最底下、「已同步」栏之上）：＋新增条目 / ⇅排序 / ▤分组。
   分组视图 = 有分组时按组折叠（跟世界书一个路子）；排序 / 分组模式下每行多出对应的钮 */
function presetRowHTML(it, m, seq) {
  var L = tokOf(it.content), pct = it.enabled ? Math.round(L / m * 100) : 0;
  var ch = findQ ? findRanges(it.content, findQ).length : 0;     /* 正文命中处数 */
  var nh = findQ ? findRanges(it.name, findQ).length : 0;
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
    +     hlQ(it.name, findQ)
    +     (findQ && !ch && nh ? '<i class="nmhit" title="命中的是条目名，不在正文里">名</i>' : "")
    +     phTag + "</span>"
    +   (pGrpMode && grpName ? '<span class="gtag">' + esc(grpName) + "</span>" : "")
    +   '<span class="cc">' + fmt(L) + "</span>"
    +   (pSort && it.identifier
        ? '<span class="grip" data-grip="' + escAttr(it.identifier) + '" title="按住上下拖动">' + SV.grip + "</span>"
        : "")
    +   (it.ph ? "" : '<span class="op" data-edbtn="' + it.id + '" title="编辑">' + SV.edit + "</span>")
    +   '<span class="ratio"><i style="width:' + pct + '%"></i></span>'
    + "</div>";
  if (editingId === it.id) h += '<div class="edmark">正在全屏编辑这条…</div>';
  /* 正文里命中了 → 摘要一行告诉你它命在哪（名字命中但正文没有，则只挂个「名」标）。
     摘要直接由 snipHTML 产出带 mark 的 HTML：整段命中时它自己会兜底标开头，
     不会出现「说搜到了却一个黄点都看不见」。 */
  if (findQ && editingId !== it.id && ch) {
    h += '<div class="row sub"><span class="nm sub">' + snipHTML(it.content, findQ, 58) + "</span>"
      + '<span class="hits">' + ch + " 处</span></div>";
  }
  return h;
}
function pgSelCount() {
  var n = 0;
  for (var k in pgSel) if (pgSel[k]) n++;
  return n;
}
/* ── 整体替换（跨条目）──
   两组分类，都是为了「不让他猜」：
     改哪里 = 正文 / 条目名 / 两样都改     （默认正文 —— 绝大多数情况只改内容）
     改哪些 = 全部 / 已开启 / 已关闭       （默认已开启 —— 改关闭的条目通常是误操作）
   每次切分类都当场重算「几条 / 几处」写在按钮上方，切到空组合时按钮直接变灰，
   不让人点进去才发现是 0。 */
var bulkW = "body", bulkK = "on";
var pUndo = null;                    /* { snap:[{id,name,content}], hits, at } */

function bulkStat(q, where, which) {
  var n = 0, hits = 0;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.identifier) continue;                  /* 酒馆的插入位置，本来就没正文 */
    if (which === "on" && !it.enabled) continue;
    if (which === "off" && it.enabled) continue;
    var c = 0;
    if (where !== "name") c += findRanges(it.content, q).length;
    if (where !== "body") c += findRanges(it.name, q).length;
    if (c) { n++; hits += c; }
  }
  return { n: n, hits: hits };
}
function pBulkHTML() {
  if (!findQ) return "";
  var h = "";
  if (pUndo) {
    h += '<div class="bulkbar"><span class="bt">刚才替换了 <b>' + pUndo.hits + "</b> 处</span>"
      +  '<span class="grow"></span><span class="chip" data-pundo="1">撤销</span></div>';
  }
  var st = bulkStat(findQ, "body", "on");
  /* 一处都不剩了就别再摆个"整体替换"按钮（点了也是 0，纯添乱） */
  if (st.hits) {
    h += '<div class="bulkbar"><span class="bt">搜到 <b>' + st.n + "</b> 条 / 共 <b>" + st.hits + "</b> 处"
      +  "（已开启）</span><span class=\"grow\"></span>"
      +  '<span class="chip go2" data-pbulk="1">整体替换</span></div>';
  }
  return h;
}
function pBulkTip() {
  /* ★ 查找词以弹窗里的输入为准（可以换词），不锁死顶部搜索框那个 */
  var oldEl = QI("bkOld");
  var q = oldEl ? oldEl.value : findQ;
  var st = bulkStat(q, bulkW, bulkK);
  var tip = QI("bkTip");
  if (tip) {
    tip.innerHTML = q
      ? ("会改 <b>" + st.n + "</b> 条，共 <b>" + st.hits + "</b> 处。"
        + (st.hits ? "<br>改完 30 秒内可以撤销。" : "<br>这个范围里没有能改的东西。"))
      : "先在上面写要查找什么。";
  }
  var yes = QI("dlgYes");
  if (yes) { yes.disabled = !st.hits; yes.style.opacity = st.hits ? "" : ".45"; }
  var sw = QI("segW"), sk = QI("segK"), i;
  if (sw) for (i = 0; i < sw.children.length; i++)
    sw.children[i].classList.toggle("on", sw.children[i].getAttribute("data-bw") === bulkW);
  if (sk) for (i = 0; i < sk.children.length; i++)
    sk.children[i].classList.toggle("on", sk.children[i].getAttribute("data-bk") === bulkK);
}
function pBulkOpen() {
  if (!findQ) return;
  bulkW = "body"; bulkK = "on";
  dlgOpen("整体替换",
    '<div class="bk">'
    /* 默认带当前搜索词进来，但就是个能改的框——换一个词，下面的数字立刻重算 */
    + '<div class="bkr"><span class="bklb">查找</span><textarea id="bkOld" rows="1" spellcheck="false" placeholder="要查找的词 / 句子"></textarea></div>'
    + '<div class="bkr"><span class="bklb">替换为</span>'
    +   '<textarea id="bkNew" rows="2" spellcheck="false" placeholder="留空＝把这些字删掉"></textarea></div>'
    + '<div class="bkr"><span class="bklb">改哪里</span><div class="seg" id="segW">'
    +   '<b data-bw="body" class="on">正文</b><b data-bw="name">条目名</b><b data-bw="both">两样都改</b>'
    + "</div></div>"
    + '<div class="bkr"><span class="bklb">改哪些</span><div class="seg" id="segK">'
    +   '<b data-bk="all">全部</b><b data-bk="on" class="on">已开启</b><b data-bk="off">已关闭</b>'
    + "</div></div>"
    + '<div class="bktip" id="bkTip"></div>'
    + "</div>",
    "确认替换", function () { pBulkDo(); });
  var oldEl = QI("bkOld");
  if (oldEl) { oldEl.value = findQ; autogrow(oldEl, 64); }
  pBulkTip();
  setTimeout(function () {
    var el = QI("bkNew"); if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) {}
  }, 60);
}
function pBulkDo() {
  var oldEl = QI("bkOld");
  var q = oldEl ? oldEl.value : findQ;
  if (!q) { toast("先写要查找什么"); return; }
  var el = QI("bkNew"), rep = el ? el.value : "";
  var snap = [], n = 0, hits = 0, i, j;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it.identifier) continue;
    if (bulkK === "on" && !it.enabled) continue;
    if (bulkK === "off" && it.enabled) continue;
    var c = 0, nv = it.content, nn = it.name, rs;
    if (bulkW !== "name") {
      rs = findRanges(nv, q);
      if (rs.length) {
        c += rs.length;
        for (j = rs.length - 1; j >= 0; j--) nv = nv.slice(0, rs[j].s) + rep + nv.slice(rs[j].e);
      }
    }
    if (bulkW !== "body") {
      rs = findRanges(nn, q);
      if (rs.length) {
        c += rs.length;
        for (j = rs.length - 1; j >= 0; j--) nn = nn.slice(0, rs[j].s) + rep + nn.slice(rs[j].e);
      }
    }
    if (!c) continue;
    snap.push({ id: it.id, name: it.name, content: it.content });
    if (bulkW !== "name") it.content = nv;
    if (bulkW !== "body") it.name = nn;
    n++; hits += c;
  }
  dlgClose();
  if (!hits) { toast("这个范围里没有能改的东西"); return; }
  pUndo = { snap: snap, hits: hits, at: Date.now() };
  renderList(); updStat(true);
  save("整体替换 " + hits + " 处（" + n + " 条）");
  toast("已替换 " + hits + " 处，可以撤销");
}
function pUndoDo() {
  if (!pUndo) return;
  if (Date.now() - pUndo.at > 30000) {
    pUndo = null; renderList(); toast("超过 30 秒，撤销不了了"); return;
  }
  for (var i = 0; i < pUndo.snap.length; i++) {
    var s = pUndo.snap[i], it = byId(s.id);
    if (it) { it.name = s.name; it.content = s.content; }
  }
  pUndo = null;
  renderList(); updStat(true);
  save("撤销了刚才的整体替换");
  toast("已撤销");
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
  if (findQ && !hit) { el.innerHTML = noHitHTML("这个预设里") + pBulkHTML(); findCount(0); return; }
  h += unusedBlockHTML();
  h += pBulkHTML();
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
/* ── 正文框定高（v2.5：全部实测，一个估算值都不留）────────────────────
   ★★ 他 2026-11-14 拍照报的原话：「第二张图那个输入框位置太小了，你可以根据我手机
      那个键盘和那个输入框位置调一下」，并确认「一进去就小（键盘还没弹）」。
   病根就在 v1.7 的估算上：拿「上次记住的键盘比例（没记过按 0.62 估）」× 屏高
   当作键盘态可视高 —— 那是【键盘弹着】时量出来的比例，却被无条件用在「键盘没弹」
   的时候。于是每次进去都按「键盘已经吃掉四成屏」来算，框天生矮一截，
   框底下那一大块空白就是被这么算没的（他第二张图里框和键盘之间那块）。
   现在：不估了，全实测 ——
     框高 = sheet 实高 − 上面那几块（顶栏 / 查找条 / 「正文」那行）− 下面那几块
            （计数那行 / 底栏 / 内边距 / 间距）。
     sheet 的高度本来就是 sheetFit 按 visualViewport 写死的（键盘一弹它自己变矮），
     所以这个式子【自动】跟着键盘走：键盘弹着算到键盘上沿，没弹就一直算到屏幕底。
   ⚠ 别改回 vh / %（vh 键盘弹起时不变），也别改回「比例估算」（就是他这次报的问题）。
   ⚠ 也别再回来数「固定块有几个」—— 用 offsetHeight 实测 sheet 的直接子节点，
     以后加/删一块（比如底栏折叠）不用再回来改这里。 */
/* 读某个元素上某个 CSS 长度（px），读不到就用兜底值。
   ★ 为什么要兜底：getComputedStyle 在部分 WebView 里对 rowGap 返回 "normal"，
     parseFloat 出来是 NaN —— 直接当 0 用会少扣 14px，框就比能放的多长 14px、底部被裁。
     （这类的教训：宁可退回 CSS 里写死的值，也别把 NaN 当 0。） */
function cssPx(el, prop, dflt) {
  var cs = null;
  try { cs = vpWin().getComputedStyle(el, null); } catch (e0) { cs = null; }
  if (!cs) return dflt;
  var v = parseFloat(cs[prop]);
  if (!isFinite(v) && prop === "rowGap") v = parseFloat(cs.gap);
  return isFinite(v) ? v : dflt;
}
/* 这一个式子就是「现在能给正文框多高」，返回 0 ＝ 量不出来（页面没渲染好）。
   拆出来单独放，是为了能测：不依赖任何状态，纯几何。 */
function taRoom() {
  var s = sheetEl();
  if (!s || !s.classList.contains("on") || edWhich !== "p") return 0;
  var wrap = s.querySelector(".tawrap"); if (!wrap) return 0;
  var sr = s.getBoundingClientRect ? s.getBoundingClientRect() : null;
  /* sheet 的实高：优先 rect；量不出来（还没排版 / 缩放的 iframe 里 rect 常为 0）
     就退到 sheetFit 写进去的那条行内高度 —— 那是同一个值，不会算错。 */
  var shh = (sr && sr.height) ? sr.height : 0;
  if (!shh) {
    var ih = parseFloat(s.style && s.style.height);
    shh = s.offsetHeight || (isFinite(ih) ? ih : 0);
  }
  if (!shh) return 0;
  var fixed = 0, i, c, kids;
  /* ① 真正的一层是 [data-edbox]（sheetRender 把整页包在它里面）—— 直接遍历 sheet
     的子节点只会数到这一个壳，上下固定块全漏掉（少扣一整块，框就比能放的高一截）。 */
  var box = s.querySelector("[data-edbox]") || s;
  for (i = 0; i < box.children.length; i++) {
    c = box.children[i];
    if (!c || !c.classList || c.classList.contains("sarea")) continue;
    fixed += c.offsetHeight || 0;
  }
  /* ② .sarea 自己：上下内边距 + 除正文框以外的孩子 + 它们之间的间距 */
  var area = s.querySelector(".sarea");
  if (area) {
    var padT = cssPx(area, "paddingTop", 6);
    var padB = cssPx(area, "paddingBottom", 6);
    var gp = cssPx(area, "rowGap", 7);
    fixed += padT + padB;
    kids = area.children || [];
    for (i = 0; i < kids.length; i++) {
      if (kids[i] === wrap) continue;
      fixed += kids[i].offsetHeight || 0;
    }
    fixed += gp * Math.max(0, kids.length - 1);
  }
  return Math.round(shh - fixed);
}
function fitTa() {
  var s = sheetEl();
  if (!s || !s.classList.contains("on")) return;
  var wrap = s.querySelector(".tawrap"); if (!wrap) return;
  var h = taRoom();
  if (!h) return;                                  /* 量不出来就别乱写高度 */
  if (h < 96) h = 96;                              /* 兜底下限：再挤也要能看见几行 */
  if (Math.abs((wrap.offsetHeight || 0) - h) <= 2) return;
  wrap.style.height = h + "px";
}
/* 键盘弹起 / 收起、转屏都会让可视高变 —— 记下真值并重算一次。
   ★ 只在编辑页生效（fitTa 自己会挡别的页）；60ms 防抖，别跟着键盘动画狂算。 */
var kbT = 0, kbOn = false;
function kbWatch() {
  if (kbOn) return false;
  var W = vpWin(), vv = W.visualViewport;
  if (!vv || !vv.addEventListener) return false;
  kbOn = true;
  vv.addEventListener("resize", function () {
    clearTimeout(kbT);
    kbT = setTimeout(function () {
      /* 键盘一弹，visualViewport 变矮 → sheet 重贴一次，正文框按新的实高重算。
         ★ v2.5 起这里不用再记「键盘比例」了：fitTa 全靠实测，键盘多高都自己算对。 */
      try { sheetFit(); fitTa(); } catch (e) { ownErr(e); }
    }, 60);
  });
  return true;
}
function sheetRender() {
  var s = sheetEl(); if (!s) return;
  s.innerHTML = (edWhich === "w" ? sheetWorld()
    : (edWhich === "r" ? sheetRegex()
    : (edWhich === "f" ? sheetFavSel()
    : (edWhich === "fr" ? sheetFavRead() : sheetPreset()))));
  fitTa();                    /* 查找条一摊开/收起，固定块高度就变了，正文框跟着重算 */
}
function sheetShow(kind) {
  edWhich = kind;
  var s = sheetEl(); if (!s) return;
  /* ⚠ 查找条的状态必须在 sheetRender 之前定好，否则渲染出来的还是「收起」那个壳，
     之后再改状态也不会自己重画（真踩过：点搜索结果进来查找条是收着的）。 */
  if (kind === "p") {
    fBar.undo = null;
    sftOpen = false;                 /* 换一条进来 → 底栏回到收起态（正文框先给满） */
    /* 有搜索词 → 摊开并定位；没有（直接从列表点进来）→ 收起，别拿上次的词打扰人。
       但词本身留着：点一下「查找」还能接着用。 */
    if (findQ) { fBar.q = findQ; fBar.on = true; } else { fBar.on = false; }
  }
  sheetRender(); s.classList.add("on"); sheetFit(); fitTa();
  try { pdoc.body.style.overflow = "hidden"; } catch (e) {}   /* 底下那层别跟着一起滑 */
  /* 键盘是异步抬起来的：刚 focus 时拿到的常常还是抬起之前的尺寸，多补几枪 */
  var waits = [30, 90, 240, 520, 900];
  for (var i = 0; i < waits.length; i++) setTimeout(function () { sheetFit(); fitTa(); }, waits[i]);
  if (kind === "p") {
    fBoot();
    /* ★★ v1.6：进来【不自动抢焦点】。以前这里 focus 正文，手机立刻弹键盘，
       下面那串 sheetFit 又按可见区重算五次，整页高度跟着抖 —— 他说的「卡」就是这一下。
       现在进来已经是编辑框（不再是文字层），手指点一下正文就能打字，那一下才是他主动要键盘。 */
    return;
  }
  /* 收藏的勾选页是只读列表，没有输入框，别去 focus 一个不存在的框；
     收藏的阅读页同理（抢焦点＝手机键盘弹起来把正文盖住一半） */
  if (kind === "f" || kind === "fr") return;
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
/* =====================================================================
   全屏编辑页里的「查找 / 替换」（v1.6 定稿）
     ① 进来就是编辑框本身，没有任何「查看态」要再点一下 ——
        他 2026-11-13 原话：「直接给我改成进入那里就是编辑状态，不要给我搞那种高亮」。
     ② 不再有「第 N 处」说明条——他原话：「你为什么要在上面标一个第一处什么的」。
        状态只有两处：mini 收起行的一行小字 + 计数 N/M。
     ③ 定位不抢焦点、不画任何自造高亮：只 setSelectionRange + 按行号滚过去，
        手机键盘不弹、不重排 —— 「卡」是他最不能忍的一条。
   ===================================================================== */
var fBar = { on: false, q: "", r: "", hi: 0, hits: [], undo: null };
var fMode = "edit";             /* v1.6 起恒定 edit（查看态已删除，变量留着兼容旧调用） */
function fSc() { return QI("sheet"); }
function fTa() { var s = fSc(); return s ? s.querySelector('[data-ta="' + editingId + '"]') : null; }
function fQv() { var el = QI("fq"); return el ? el.value : fBar.q; }
function fRv() { var el = QI("fr"); return el ? el.value : fBar.r; }

function fBarHTML() {
  if (!fBar.on) {
    return '<div class="fbar mini" data-fact="open" title="查找 / 替换">'
      +   '<span class="fic">' + SV.find + "</span>"
      +   '<span class="ft" id="fminiTx"></span>'
      +   '<span class="fopen">查找 / 替换</span>'
      + "</div>";
  }
  return '<div class="fbar" id="fbar">'
    + '<div class="frow"><span class="flb">查找</span>'
    +   '<textarea id="fq" rows="1" spellcheck="false" placeholder="词、句子或整段"></textarea>'
    +   '<span class="fnav"><b data-fact="prev" title="上一处">‹</b><i id="fcnt">0/0</i>'
    +     '<b data-fact="next" title="下一处">›</b></span>'
    + "</div>"
    + '<div class="frow"><span class="flb">替换</span>'
    +   '<textarea id="fr" rows="1" spellcheck="false" placeholder="留空＝把这些字删掉"></textarea>'
    + "</div>"
    + '<div class="fbtn">'
    +   '<span class="chip" data-fact="rep">替换</span>'
    +   '<span class="chip go2" data-fact="repall">全部替换<b id="bRepAllN"></b></span>'
    +   '<span class="grow"></span>'
    +   '<span class="chip undo" data-fact="undo">撤销</span>'
    +   '<span class="chip" data-fact="close">收起</span>'
    + "</div>"
    + "</div>";
}
/* 打开编辑页时把状态灌回 DOM。forceMode：手动点「查找 / 替换」摊开时强制 edit，
   别把查看态硬塞给他（查看态是「从搜索结果进来」的待遇）。 */
function fBoot(forceMode) {
  if (!editingId) return;
  fBar.undo = null;                              /* 换了条目，上一条的撤销不能带过来 */
  if (findQ) { fBar.q = findQ; fBar.on = true; } /* 从搜索结果进来的，直接摊开 */
  /* ★ v1.6：没有查看态了，进来就是编辑框。forceMode 保留只为不改调用处签名 */
  var q = QI("fq"), r = QI("fr");
  if (q) { q.value = fBar.q || ""; autogrow(q, 52); }
  if (r) { r.value = fBar.r || ""; autogrow(r, 52); }
  fRecalc(0, true);      /* 先算好命中（计数用），不滚 */
  if (fBar.hits.length) fShowHit();   /* 带搜索词进来的：滚到那一处 */
}
/* 名字里的命中不混进正文计数（两个框，编号混在一起会看不懂）——
   但得让他知道名字里也命中了：正文 0 处时计数位置变成「名字 N」，点一下跳过去 */
function fNameHits() {
  var s = fSc(), nm = s ? s.querySelector('[data-nm="' + editingId + '"]') : null;
  var v;
  if (nm) v = nm.value;
  else if (draft && draft.name !== null && draft.name !== undefined) v = draft.name;
  else { var it = byId(editingId); v = it ? it.name : ""; }
  return fBar.q ? findRanges(v, fBar.q).length : 0;
}
function fNameGo() {
  var s = fSc(), nm = s ? s.querySelector('[data-nm="' + editingId + '"]') : null;
  if (!nm) return;
  var rs = findRanges(nm.value, fBar.q); if (!rs.length) return;
  try { nm.scrollIntoView({ block: "center" }); } catch (e0) {}
  try { nm.focus({ preventScroll: true }); nm.setSelectionRange(rs[0].s, rs[0].e); } catch (e) {}
  toast("命中在下面的「名字」框里");
}
/* 重算命中：计数、mini 一行字、按钮亮灰、标记重画。
   noScroll＝只刷数字，别动滚动位置（自己打字 / 插宏的时候用） */
function fRecalc(keep, noScroll) {
  var ta = fTa(); if (!ta) return;
  var q = fQv();
  fBar.q = q;
  fBar.hits = findRanges(ta.value, q);
  var n = fBar.hits.length;
  var c = QI("fcnt"), b2n = QI("bRepAllN");
  if (b2n) b2n.textContent = n ? " " + n : "";
  var rb = QI("fbar") ? QI("fbar").querySelectorAll('[data-fact="rep"],[data-fact="repall"]') : [];
  for (var i = 0; i < rb.length; i++) rb[i].classList.toggle("off", !n);
  /* mini 那行字把状态一句话说清——不搞「第 N 处 + 整句」那种占地方的 */
  var mt = QI("fminiTx");
  if (mt) {
    if (!q) mt.innerHTML = "查找正文，或替换";
    else if (n) {
      var show = q.replace(/\s+/g, " ");
      mt.innerHTML = "查找 <b>" + esc(show.slice(0, 16)) + (show.length > 16 ? "…" : "")
        + "</b> · " + n + " 处";
    } else mt.innerHTML = fNameHits() ? "正文里没有 · 名字里有" : "没找到";
  }
  if (!n) {
    if (c) {
      var nn = fNameHits();
      if (q && nn) { c.textContent = "名字 " + nn; c.classList.add("nm"); c.onclick = fNameGo; }
      else { c.textContent = q ? "0/0" : ""; c.classList.remove("nm"); c.onclick = null; }
    }
    return;
  }
  fBar.hi = ((keep % n) + n) % n;
  if (c) { c.textContent = (fBar.hi + 1) + "/" + n; c.classList.remove("nm"); c.onclick = null; }
  if (!noScroll) fShowHit();
}
/* 跳到当前这一处：只做两件事 —— 选区套住 + 滚过去。
   ★★ 2026-11-13 他连着骂：自造高亮（查看态 mark / 深金选区）全部删掉，只留系统原生的
      选中态。这里【不 focus】：一 focus 手机就把键盘顶起来，整页高度重算+滚动被夹回，
      那一下就是他说的「卡」。他要点字自己会点。 */
var F_LH = 0;
function fLineH(ta) {
  if (!F_LH) {
    try { F_LH = parseFloat(pwin.getComputedStyle ? pwin.getComputedStyle(ta).lineHeight : 0) || 23; }
    catch (e) { F_LH = 23; }
  }
  return F_LH;
}
function fShowHit() {
  var ta = fTa(); if (!ta || !fBar.hits.length) return;
  var h = fBar.hits[fBar.hi], c = QI("fcnt");
  if (c && !c.classList.contains("nm")) c.textContent = (fBar.hi + 1) + "/" + fBar.hits.length;
  try { ta.setSelectionRange(h.s, h.e); } catch (e) {}
  /* textarea 不会自己滚到选区，得按行号手算（行高量一次就缓存，别每跳一次算一次样式） */
  var lh = fLineH(ta);
  var line = 0, i = ta.value.indexOf("\n");
  while (i >= 0 && i < h.s) { line++; i = ta.value.indexOf("\n", i + 1); }
  ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 2 + lh);
}
function fJump(d) {
  if (!fBar.hits.length) return;
  fBar.hi = ((fBar.hi + d) % fBar.hits.length + fBar.hits.length) % fBar.hits.length;
  var c = QI("fcnt");
  if (c && !c.classList.contains("nm")) c.textContent = (fBar.hi + 1) + "/" + fBar.hits.length;
  fShowHit();
}
/* 复制条目内容（快捷输入行那颗「复制 · 条目内容」）。
   手机浏览器对 clipboard API 挑权限（酒馆 iframe 里尤其挑），被拒就退回
   execCommand 老办法；再不行就明说，别无声无息。 */
function copyTextTo(v, okMsg) {
  var done = function () { toast(okMsg); };
  var fail = function () { toast("复制被浏览器拦了——长按正文自己全选吧"); };
  function legacy() {
    try {
      var h = pdoc.createElement("textarea");
      h.value = v;
      h.style.cssText = "position:fixed;opacity:0;left:-999px;top:0";
      pdoc.body.appendChild(h);
      h.select();
      var ok = false;
      try { ok = pdoc.execCommand("copy"); } catch (e) {}
      try { h.remove(); } catch (e2) {}
      ok ? done() : fail();
    } catch (e3) { fail(); }
  }
  try {
    var nv = pwin && pwin.navigator ? pwin.navigator : navigator;
    if (nv.clipboard && nv.clipboard.writeText) nv.clipboard.writeText(v).then(done, legacy);
    else legacy();
  } catch (e) { legacy(); }
}
function pCopyBody() {
  var ta = fTa(); if (!ta) return;
  copyTextTo(ta.value, "已复制 " + ta.value.length + " 字");
}
/* 改完正文要把 draft / token / 自动保存都接上，不然这一改就丢了 */
function fPush(v) {
  if (draft) draft.content = v; else if (editingId) harvestDraft(true);
  var sc = edScope(editingId);
  var cnt = sc && sc.querySelector('[data-cnt="' + editingId + '"]');
  if (cnt) cnt.textContent = fmt(tokOf(v)) + " tok";
  autoSave();
}
function fSnap() {
  var ta = fTa(), it = byId(editingId); if (!ta || !it) return;
  fBar.undo = { id: it.id, content: ta.value, name: it.name, at: Date.now() };
  var u = QI("fbar") ? QI("fbar").querySelector('[data-fact="undo"]') : null;
  if (u) u.classList.add("can");
}
function fReplaceOne() {
  var ta = fTa(); if (!ta || !fBar.hits.length) return;
  var h = fBar.hits[fBar.hi], rep = fRv();
  fSnap();
  ta.value = ta.value.slice(0, h.s) + rep + ta.value.slice(h.e);
  fPush(ta.value);
  /* 换完仍从「当前这处」开始数：它现在已经是下一处了，连点几下就是一个个换 */
  fRecalc(fBar.hi);
  toast("替换 1 处");
}
function fReplaceAll() {
  var ta = fTa(); if (!ta || !fBar.hits.length) return;
  var rep = fRv(), n = fBar.hits.length, i;
  fSnap();
  var v = ta.value;
  for (i = fBar.hits.length - 1; i >= 0; i--) v = v.slice(0, fBar.hits[i].s) + rep + v.slice(fBar.hits[i].e);
  ta.value = v;
  fPush(v);
  fRecalc(0);
  toast("本条替换 " + n + " 处");
}
function fUndoDo() {
  var u = fBar.undo;
  if (!u) { toast("没有可以撤销的改动"); return; }
  var ta = fTa();
  if (ta) { ta.value = u.content; fPush(u.content); }
  var it = byId(u.id); if (it && u.name !== undefined) it.name = u.name;
  fBar.undo = null;
  var b = QI("fbar") ? QI("fbar").querySelector('[data-fact="undo"]') : null;
  if (b) b.classList.remove("can");
  fRecalc(0);
  toast("已撤销");
}
function sheetPreset() {
  var it = byId(editingId); if (!it) return "";
  var nm = draft && draft.name !== null ? draft.name : it.name;
  var ct = draft && draft.content !== null ? draft.content : it.content;
  var rl = draft && draft.role ? draft.role : it.role;
  return '<div data-edbox="' + it.id + '">'
    + sheetHead(nm || "（没名字的条目）")
    + fBarHTML()
    + '<div class="sarea">'
    /* 标签和快捷输入挤在同一行：之前各占一行，正文框就被顶下去一截 */
    +   '<div class="shead">'
    +     '<span class="slb">正文 · 这条就是要发给 AI 的东西</span>'
    +     '<span class="grow"></span>'
    +     macroRow(it.id, true)
    +   "</div>"
    +   '<div class="tawrap">'
    +     '<textarea data-ta="' + it.id + '" spellcheck="false" placeholder="写点什么…">' + esc(ct) + "</textarea>"
    +   "</div>"
    +   '<div class="smeta"><span>停手一秒自动存</span><span class="grow"></span>'
    +     '<span class="stok" data-cnt="' + it.id + '">' + fmt(tokOf(ct)) + " tok</span>"
    +   "</div>"
    + "</div>"
    /* ★ v2.5：底栏「名字 / 角色」默认收成一条 —— 他 2026-11-14 定：
       正文框要一直撑到键盘上沿，这两栏挡在中间就只能让。点一下这条才展开。
       ★ 收起来时这条【不许高】：它是正文框唯一的对手，高度全从它身上省。 */
    + '<div class="sft' + (sftOpen ? "" : " fold") + '" data-sft="1">'
    +   '<button type="button" class="ftg" data-ftg="1">'
    +     '<span class="ftk">名字</span><b class="ftv">' + esc(nm || "（未命名）") + "</b>"
    +     '<span class="ftk">角色</span><b class="ftv ftw">' + esc(rl || "system") + "</b>"
    +     '<span class="grow"></span><span class="ftx">' + (sftOpen ? "收起" : "展开") + "</span>"
    +   "</button>"
    +   '<div class="ftb">'
    +   '<div class="srow"><span class="lb">名字</span>'
    +     '<input type="text" data-nm="' + it.id + '" value="' + escAttr(nm) + '" placeholder="条目名"></div>'
    +   '<div class="srow"><span class="lb">角色</span>' + roleSelect(it.id, rl)
    +     '<span class="grow"></span><span class="smeta">停手一秒自动存</span></div>'
    +   "</div>"
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
/* 反查：手里只有「书名 + uid」，要拿到编辑页用的 wN。
   ★ 新建条目必须靠它 —— 新条目的 uid 是酒馆给的，而且是重读完才知道排在哪儿，
     wIdx 又按渲染顺序发号，所以只能等重画之后再来查。 */
function wbEidFind(bn, uid) {
  for (var i = 0; i < wIdx.length; i++) {
    var w = wIdx[i];
    if (w && w[0] === bn && String(w[1]) === String(uid)) return "w" + i;
  }
  return null;
}
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
    +   '<div class="t1"><b class="bk">' + hlQ(b.name, findQ) + '</b><i class="sep"> › </i>'
    +     hlQ(e.comment || "(无标题)", findQ) + "</div>"
    +   '<div class="t2">' + (keys ? "<em>" + hlQ(keys, findQ) + "</em> " : "")
    +     snipHTML(e.content, findQ, 46) + "</div>"
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
        + '<span class="chip add" data-wbnew="1" title="建一本空的世界书">' + SV.plus + '新建世界书</span>'
        + '<span class="chip" data-grpadd="1" title="把已有的书收成一堆">' + SV.grid + '新建分组</span>'
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
     + '<span class="chip add" data-wentadd="1" title="在这本书里加一条新条目">' + SV.plus + '新建条目</span>'
     + '<span class="lbl">归入</span>'
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
    +   '<div class="t1">' + hlQ(lbl, findQ) + "</div>"
    +   '<div class="t2">' + (keys ? "<em>" + hlQ(keys, findQ) + "</em> " : "")
    +     snipHTML(e.content, findQ, 40) + "</div>"
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
/* 宏：点一下插到光标处，不是追加到末尾。
   ★ textarea 一旦重新赋值 scrollTop 会被清零——先记下来插完还回去，
     不然在正文中间插个宏，页面直接甩回最顶上（真踩过） */
function insertMacro(el) {
  var id = el.getAttribute("data-mct"), txt = el.getAttribute("data-mc");
  var sc = edScope(id); if (!sc) return;
  var ta = sc.querySelector('[data-ta="' + id + '"]') || sc.querySelector('[data-wta="' + id + '"]');
  if (!ta) return;
  var v = ta.value;
  var s = (ta.selectionStart == null ? v.length : ta.selectionStart);
  var e = (ta.selectionEnd == null ? v.length : ta.selectionEnd);
  var st = ta.scrollTop;
  ta.value = v.slice(0, s) + txt + v.slice(e);
  var p = s + txt.length;
  try { ta.focus({ preventScroll: true }); ta.setSelectionRange(p, p); } catch (err) {}
  ta.scrollTop = st;
  var cnt = sc.querySelector('[data-cnt="' + id + '"]') || sc.querySelector('[data-wcnt="' + id + '"]');
  if (cnt) cnt.textContent = fmt(tokOf(ta.value)) + " tok";
  if (draft) draft.content = ta.value;
  if (draftW) draftW.content = ta.value;
  /* 预设编辑页开着查找条：刷计数 / mini，但别把滚动拽走 */
  if (edWhich === "p" && editingId === id && fBar.on) fRecalc(fBar.hi, true);
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
/* =====================================================================
   新建：世界书 / 世界书条目
     接口都是酒馆助手官方那套（worldbook.d.ts）：
       createWorldbook(name, entries?)                 → 同名会失败，返回 false
       createWorldbookEntries(name, entries[], {render}) → 不填的字段酒馆给默认值
     ⚠ 不用 createOrReplaceWorldbook：同名时它是【替换】，会把已有的书整本清空 ——
       这不是「新建」该有的行为，误点一下就是数据事故。
   ===================================================================== */
/* 一级：新建一本世界书。建完直接进这本书 —— 空书进来正好看见「整本没启用」的提示和开关 */
function wbNewBook() {
  var a = call("createWorldbook");
  if (!a) { toast("这台酒馆的助手没有「新建世界书」接口"); return; }
  dlgOpen("新建世界书",
    '<div class="ginnew"><input id="wbnewnm" spellcheck="false" placeholder="给这本世界书起个名"></div>'
    + '<div class="exhint">建好后是空书，进去再加条目。<br>'
    + '新书<b>默认没启用</b>，进书后记得把上面那个开关打开。</div>',
    "创建", function () {
      /* ★ dlgYes 是「先关弹窗再跑回调」—— 弹窗只是藏起来，节点还在，这时读值没问题 */
      var el = QI("wbnewnm");
      var nm = el ? String(el.value || "").trim() : "";
      if (!nm) { toast("得写个名字"); return; }
      if (wbFind(nm)) { toast("已经有叫「" + nm + "」的世界书了"); return; }
      callThen("createWorldbook", [nm], function (ok) {
        if (ok === false) { toast("没建成：已经有同名的世界书"); return; }
        toast("已新建「" + nm + "」");
        wbLoad();                                  /* 整份重读，新书才会出现在列表里 */
        setTimeout(function () { wbOpenBook(nm); }, 150);
      }, function (e) {
        ownErr(e);
        toast("新建失败：" + (e && e.message ? e.message : e));
      });
    });
  setTimeout(function () {
    var el = QI("wbnewnm");
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} }
  }, 60);
}
/* 书里：新建一条条目。不填的字段酒馆自动给默认值，所以只传标题和空正文就够。
   ★ 建成后直接把编辑页摊开 —— 跟预设页「新增条目」一个手感，
     否则只是多一条空白行，还得自己再找它点进去。 */
function wbAddEntry() {
  var b = wbFind(wbBook);
  if (!b) { toast("先选一本书"); return; }
  if (!call("createWorldbookEntries")) { toast("这台酒馆的助手没有「新建条目」接口"); return; }
  finishEdit();
  toast("正在新建…");
  callThen("createWorldbookEntries",
    [b.name, [{ name: "新条目", content: "" }], { render: "immediate" }],
    function (r) {
      var ne = r && r.new_entries && r.new_entries[0];
      if (!ne) { toast("没建成：酒馆没把新条目返回来"); return; }
      wbLoadEntries(b, function () {                 /* 重读这本，新条目才排进来 */
        renderList();                                /* wIdx 按渲染顺序发号，必须重画后再查 */
        var id = wbEidFind(b.name, ne.uid);
        if (!id) { toast("已加一条，在列表里"); return; }
        edW = id; draftW = null;
        sheetShow("w");
        toast("已加一条，直接写字就行");
      });
    },
    function (e) {
      ownErr(e);
      toast("新建失败：" + (e && e.message ? e.message : e));
    });
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
/* ── 顺序自检（v2.4）──────────────────────────────────────────────────
   为什么要有这一段：2026-11-14 他导出预设给我，里面 23 条开着的挤到最前面、
   47 条关着的全甩到后面 —— 条目和开关一条没变，只有顺序表被按开关状态重排过。
   顺序不只是好看：酒馆是照这个顺序把条目拼进上下文的，顺序一变，输出风格就漂。
   所以：① 读到「两堆」就当场提醒；② 每读到一次【正常】顺序就存个快照，
   下次被打乱时能用它一键还原。 */
function ordSnapAll() {
  var o = lsJSON(ORD_K, {});
  return (o && typeof o === "object" && !(o.push)) ? o : {};
}
function ordSnapGet(name) {
  var a = ordSnapAll(), v = a[String(name || "")];
  return (v && v.seq && v.seq.push) ? v.seq : null;
}
function ordSnapPut(name, seq) {
  if (!name || !seq || !seq.length || seq.length < 6) return;
  var a = ordSnapAll();
  a[String(name)] = { seq: seq.slice(0, 400), at: Date.now() };
  try { lsSet(ORD_K, JSON.stringify(a)); } catch (e) {}
}
/* 「顺序是不是被打成两堆」：开着的都在前、关着的都在后。
   ⚠ 门槛 3/3：只有一两条开关的预设本来就长这样，不能算坏（宁可漏报，不许误报）。 */
function ordIsGrouped(seq, en) {
  var seenOff = false, on = 0, off = 0;
  for (var i = 0; i < seq.length; i++) {
    var e = en[seq[i]];
    if (e === undefined) continue;            /* 顺序表里指向已删条目的坑，跳过 */
    if (e) { if (seenOff) return null; on++; } else { seenOff = true; off++; }
  }
  return (on >= 3 && off >= 3) ? { on: on, off: off } : null;
}
function ordBarHTML() {
  if (!ordWarn) return "";
  var canFix = !!ordSnapGet(presetName);
  return '<div class="errbar ordbar" data-ordbar="1">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round">'
    +   '<path d="M12 3l9 16.5H3L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>'
    + '<b>顺序被打成两堆：开着的 ' + ordWarn.on + " 条全在前、关着的 " + ordWarn.off + " 条全在后"
    +   (canFix ? "" : "（条目和开关一条没少，只是顺序变了）") + "</b>"
    + (canFix ? '<span class="chip" data-ordfix="1">还原成上次的顺序</span>' : "")
    + '<span class="x" data-ordx="1">' + (canFix ? "先不管" : "知道") + "</span>"
    + "</div>";
}
function ordFixRun() {
  var snap = ordSnapGet(presetName);
  if (!snap) { toast("没有可用的旧顺序快照，这次只能手动排"); return; }
  var have = {};
  items.forEach(function (it) { if (it.identifier) have[it.identifier] = 1; });
  var seq = snap.filter(function (x) { return have[x]; });
  if (seq.length < 3) { toast("旧快照跟现在的条目对不上，不能硬套"); return; }
  ordWarn = null;
  pReorderSeq(seq);        /* 里面会 save()（写回预设）+ renderList() */
  toast("已还原成上次的顺序（快照之后新加的条目排在最后）");
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
  else if (view === "shot") renderShot();
  else if (view === "fav") renderFav();
  else if (view === "about") renderAbout();
  else listRegex();
  /* 有报错就在最顶上补一条（各列表都会 innerHTML 重画，放这儿最省事） */
  try {
    var el = QI("list"), bar = errBarHTML();
    if (el && bar) el.insertAdjacentHTML("afterbegin", bar);
    /* 顺序自检只对预设页有意义（v2.4）：世界书 / 正则页没有「顺序」这回事 */
    var ob = (view === "preset") ? ordBarHTML() : "";
    if (el && ob) el.insertAdjacentHTML("afterbegin", ob);
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
  if (v === "shot" && findOn) findShow(false);         /* 截图页也不要搜索框 */
  if (v === "fav" && findOn) findShow(false);          /* 收藏页也不要搜索框 */
  if (v === "about" && findOn) findShow(false);        /* 关于页同理 */
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
  /* ★ 2026-11-13：面板一开就把聊天里那几百个消息图标整列藏掉（CSS 见 shotCSS 里
     .sk-pm-open）。它们被遮住了还留在合成树里，光是打开面板就要重绘一遍，很卡。 */
  try { pdoc.documentElement.classList.add("sk-pm-open"); } catch (e0) {}
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
  try { pdoc.documentElement.classList.remove("sk-pm-open"); } catch (e1) {}
  /* 面板开着的时候 shotNear 是整段跳过的（见那里注释）→ 关掉之后补一次，
     把此刻屏幕上看得见那几条的图标挂回来。不补的话图标要等下一次滚动画出来。 */
  try { if ((shotCfg.on || favCfg.on) && pwin.SillyTavern) shotScan(true); } catch (e2) {}
}

/* =====================================================================
   消息截图（2026-11-03 他拍板的完整需求）
     · 每条酒馆消息右下角两个小图标：相机＝整条消息截成图片，方块＝复制文字
     · 存的位置＝手机「下载」文件夹。★ 绝不在应用目录留副本 —— 他旧版就栽在
       「明明只该进下载，应用系统目录也堆了一堆图」。所以这版全程内存 blob →
       浏览器下载管理器，不落临时文件、截完即从内存释放。
     · 清晰度 / 格式 / HTML 美化在管理器「截图」页签里调，美化当场换装
       （所见即所得：主题类名挂在每条 .mes 上，html2canvas 克隆时类名跟着走，
        截下来的就是屏幕上那个样子）
     · 只在真酒馆里启用（有 SillyTavern 才挂）；预览页 / 测试环境不碰
   ===================================================================== */
/* ★ 11-04：底色默认【日间白底】。以前基础配色写死成 #16181d 黑底，
     他截出来一片黑；现在黑底变成一个可选开关（截图页签「底色」那排）。
     老用户 localStorage 里没有 bg 字段 → 自然落到 day，正好是他要的默认。 */
var shotCfg = { on: true, dpi: 3, fmt: "png", thm: "", bg: "day" };
(function () { var s = lsJSON("shot", null); if (s && typeof s === "object") {
  if (typeof s.on === "boolean") shotCfg.on = s.on;
  if (isFinite(+s.dpi)) shotCfg.dpi = Math.min(4, Math.max(1, +s.dpi));
  if (s.fmt === "jpg" || s.fmt === "png") shotCfg.fmt = s.fmt;
  if (["", "card", "paper", "night"].indexOf(s.thm) >= 0) shotCfg.thm = s.thm;
  if (s.bg === "day" || s.bg === "night") shotCfg.bg = s.bg;
} })();
function shotSave() { lsSetJSON("shot", shotCfg); }
/* ── 出图日志（他要「能把报错复制给你 / 以后自己看后台日志」）──
   ★ 截图是异步 + 手机环境千奇百怪，报错一闪而过根本抓不住。所以每一次出图
     （成功 / 降级 / 失败）都往 localStorage 里记一行，截图页签底下能翻、能一键
     复制整段发给我。环形 20 条，不占地方。
   ⚠ 只记文字（时间 + 事件 + 一句话），绝不记图片本身 —— 图片塞 localStorage 会撑爆。 */
var SHOT_LOGK = "shotlog", SHOT_LOGN = 20;
/* ── 截图诊断（v2.1，专门为「正文有图、截出来只有文字」加的）────────────
   他 2026-11-13 23:31 报：正文里的 AI 生成图截不进去，但提示里**没有**
   「有 N 张图没画进去」—— 也就是 failN=0，代码认为这张消息里压根没有可处理的图。
   气泡里明明有图、代码却说没有，只可能是这几种：
     ① 图不是 <img>（是 <svg>/<canvas>/背景图，或某个插件自己画的）
     ② 图在 .mes 之外（克隆 .mes 时带不上）
     ③ <img> 存在但 src 是空的 / 指向一个还没加载的懒加载占位
   这几种在真机上长得完全不一样，读代码永远猜不出来（老教训 #2：11-04 猜错两次）。
   所以把那条消息的 DOM 结构原样写进日志，他点「复制日志」发过来就能一眼分岔。
   ⚠ 只读不写：不改 DOM、不删节点，测完对他聊天没有任何影响。 */
function shotDomDump(mes) {
  var o = [];
  try {
    var imgs = mes.querySelectorAll("img");
    o.push("img=" + imgs.length);
    for (var i = 0; i < Math.min(imgs.length, 4); i++) {
      var s = String(imgs[i].getAttribute("src") || "");
      var kind = /^data:/i.test(s) ? "data" : (/^blob:/i.test(s) ? "blob"
        : (/^https?:|^\//i.test(s) ? "url" : (s ? "rel" : "空")));
      var nw = 0, nh = 0;
      try { nw = imgs[i].naturalWidth || 0; nh = imgs[i].naturalHeight || 0; } catch (e0) {}
      o.push("i" + i + "[" + kind + "|" + s.length + "|" + nw + "x" + nh + "]");
    }
  } catch (e) {}
  try { o.push("svg=" + mes.querySelectorAll("svg").length); } catch (e1) {}
  try { o.push("canvas=" + mes.querySelectorAll("canvas").length); } catch (e2) {}
  try { o.push("iframe=" + mes.querySelectorAll("iframe").length); } catch (e3) {}
  /* shadow 数量：柏宝绘的卡片就藏在里面 —— 有 shadow 而 img=0，基本就是它 */
  try {
    var sh = 0, all2 = mes.querySelectorAll("*"), lim2 = Math.min(all2.length, 300);
    for (var q = 0; q < lim2; q++) { try { if (all2[q].shadowRoot) sh++; } catch (e6) {} }
    o.push("shadow=" + sh + (lim2 < all2.length ? "(扫前" + lim2 + ")" : ""));
  } catch (e7) {}
  /* 背景图：AI 生图插件很爱用 background-image 贴图（那样 <img> 数量就是 0） */
  try {
    var bg = 0, all = mes.querySelectorAll("div,span,p,a,i,b,section"), lim = Math.min(all.length, 80);
    for (var j = 0; j < lim; j++) {
      try {
        var bi = pwin.getComputedStyle(all[j]).backgroundImage || "";
        if (bi.indexOf("url(") >= 0) bg++;
      } catch (e4) {}
    }
    o.push("bg=" + bg);
  } catch (e5) {}
  return o.join(" ");
}
function shotLogs() { var a = lsJSON(SHOT_LOGK, []); return (a && a.push) ? a : []; }
function shotLog(tag, txt) {
  try {
    var a = shotLogs(), d = new Date(), p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    a.unshift((d.getMonth() + 1) + "-" + d.getDate() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes())
      + ":" + p2(d.getSeconds()) + "  [" + tag + "] " + String(txt == null ? "" : txt).slice(0, 300));
    while (a.length > SHOT_LOGN) a.pop();
    lsSetJSON(SHOT_LOGK, a);
  } catch (e) {}
}
/* 环境快照：他报「下载失败」时我第一件事就是看这个 —— 是 iframe 还是顶层、
   下载属性在不在、UA 是哪家的 WebView，一眼就能把路分岔找出来。 */
function shotEnvDump() {
  var o = { ver: VER };
  try { o.where = (pwin.top === pwin) ? "顶层" : "iframe 里"; } catch (e0) { o.where = "iframe(cross)"; }
  try { o.ua = String(pwin.navigator.userAgent || "").slice(0, 150); } catch (e1) {}
  /* ★ 分开记，别再合成一个 blob:false —— 上次日志里只看到 blob:false，
     根本分不清是 Blob 没有、还是 createObjectURL 没有，害得多猜一轮。 */
  try { o.blobCtor = (typeof pwin.Blob === "function"); } catch (e2a) {}
  try { o.mkURL = shotCanURL(); } catch (e2b) { o.mkURL = "ERR"; }
  try { o.fileReader = (typeof pwin.FileReader === "function"); } catch (e2c) {}
  try { o.atob = (typeof pwin.atob === "function"); } catch (e2d) {}
  o.blob = o.mkURL;                 /* 兼容旧字段名 */
  try { o.dl = ("download" in pdoc.createElement("a")); } catch (e3) {}
  try { o.topdl = ("download" in pwin.top.document.createElement("a")); } catch (e4) { o.topdl = "ERR:" + e4.message; }
  try { o.topbody = !!(pwin.top && pwin.top.document && pwin.top.document.body); } catch (e5) { o.topbody = "ERR:" + e5.message; }
  o.dpi = shotCfg.dpi; o.fmt = shotCfg.fmt; o.bg = shotCfg.bg; o.thm = shotCfg.thm;
  return o;
}
function shotLogText() {
  var a = shotLogs();
  return "【消息截图日志 · 管理器 " + VER + "】\n环境：" + JSON.stringify(shotEnvDump())
    + "\n记录（最新在最上）：\n" + (a.length ? a.map(function (s) { return "· " + s; }).join("\n") : "（还没有出过图）");
}
/* busy：防连点把内存打爆；obsOn：记住 observer 挂在哪一个 #chat 上（换聊天时
   酒馆会整个换掉 #chat 元素，挂在旧元素上的 observer 就哑了 —— 「图标时有时无」的
   一个来源就是这个） */
/* ★ 2026-11-13 加：nearN / nearDrop 只给自检和测试看「这条消息现在挂没挂图标」；
   scRoll / scFn / st 是滚动监听的把手（见 shotScrollBind）。 */
var shotState = {
  obs: null, obsOn: null, css: false, t: 0, busy: false, mesN: -1,
  scRoll: false, scFn: null, st: 0, nearAdd: 0, nearDrop: 0,
  imgFail: 0                    /* 上一张截图里没画进去的图片张数（v1.8，会念给他听） */
};
var SHOT_SV = {
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.4"/></svg>',
  cp: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>'
};
/* 样式注进主文档。主题类挂在每条 .mes 上（不是 html/body）——
   html2canvas 克隆节点时类名跟着走，克隆文档里的样式表才选得到它们 */
function shotCSS() {
  if (shotState.css) return;
  try {
    var st = pdoc.createElement("style");
    st.id = "sk-shot-css";
    st.textContent =
      ".mes{position:relative}" +
      /* ★★ 图标挂在 .mes（气泡外面那一层），不是 .mes_text 里面 —— 2026-11-13 改。
         以前挂 .mes_text 是为了躲开 .mes_buttons，但代价极大：酒馆流式输出时是
         **整块重写 .mes_text 的内容**，挂在里面的图标被一起冲掉 → 只能每拍重建一次
         → 他那份日志里几十条「补挂」就是这个死循环（生成 47 秒补了 18 次）。
         .mes 这一层不会被重写，图标挂上去就一直活着，生成期间完全不用管。
         ⚠ 代价回来了：.mes 底部有酒馆自带的 .mes_buttons 那排 —— 所以 bottom 不写死，
           由 shotOpsPlace() 实测「气泡底边到 .mes 底边」的距离（正好是按钮那排的高度）
           把图标顶上去。CSS 里这个 44px 只是没渲染出来时的兜底值。 */
      /* ★★ 2026-11-13 他报「非常卡 / 点星卡住」——图标列这里踩了一个安卓 WebView 的大坑：
         原来是 opacity:.5 + transition，**每个图标都会单独合成一层**。聊天 300 条 × 3 颗
         = 900 个半透明合成层，滚动和打开面板时 GPU 要一层层贴，必卡。
         现在：不写 opacity（改用半透明背景色，视觉上一样淡）、去掉 transition（只留 :active
         的瞬时缩放）、加 contain 让每个图标列自成布局孤岛（改它不触发整条消息重排）。 */
      /* ★ 2026-11-14 他拍照定的：①「复制那颗被下面重新生成那排挡住了」→ 整列贴到 .mes
         最底，再按【酒馆那排按钮的实测左边界】左右错开，两层永不重叠；
         ②「这些按钮给我调小一点，要更小一点」→ 27 → 20px，里面的图标 14 → 12px。
         20px 是手指还能点中的下限，别再往下调（再小就点不中，误触生成）。 */
      ".sk-shot-ops{position:absolute;right:8px;bottom:2px;display:flex;flex-direction:column;gap:4px;z-index:14;contain:layout style}" +
      ".sk-shot-ops i{width:20px;height:20px;border-radius:7px;display:flex;align-items:center;justify-content:center;" +
        "cursor:pointer;background:rgba(22,22,28,.42)}" +
      ".sk-shot-ops i:hover{background:rgba(22,22,28,.62)}" +
      ".sk-shot-ops i:active{transform:scale(.9)}" +
      /* 管理器面板一开就把图标列整列藏掉：面板是全屏遮罩，底下的聊天本来也看不见，
         留着它 = 开着面板还要合成这几百层。关面板立刻回来（这个类是加在 <html> 上的）。 */
      ".sk-pm-open .sk-shot-ops{display:none}" +
      /* 收藏那颗：已收藏 = 实心金（空心/实心一眼分得清，不靠颜色深浅） */
      ".sk-shot-ops i.sk-fv.on svg{fill:#f2c14e;stroke:#f2c14e}" +
      ".sk-shot-ops svg{width:12px;height:12px;stroke:#fff;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}" +
      /* 卡片 */
      ".sk-thm-card .mes_text{background:#fdfbf5;color:#3a3226;border-radius:6px;border-left:4px solid #b8944a;" +
        "padding:10px 12px;box-shadow:0 2px 8px rgba(0,0,0,.35)}" +
      ".sk-thm-card .mes_text b{color:#8a6420}.sk-thm-card .mes_text i{color:#7a4f8a}" +
      /* 信纸 */
      ".sk-thm-paper .mes_text{background:#f7f2e7;color:#41392c;border:none;border-radius:2px;" +
        "border-bottom:1px solid #d8ceb4;padding:14px 16px;" +
        "font-family:Georgia,'Noto Serif SC',serif;line-height:1.9}" +
      ".sk-thm-paper .mes_text b{color:#7a4a1a}" +
      /* 夜读 */
      ".sk-thm-night .mes_text{background:#101418;color:#a8c8b0;border:1px solid #22303a;border-radius:8px;padding:11px 13px}" +
      ".sk-thm-night .mes_text b{color:#7ec98f}.sk-thm-night .mes_text i{color:#6a9ab0}" +
      /* ★ 底色：日间＝酒馆原本的样子（一条样式都不加，这才叫「原样」）；
         夜间＝黑底浅字。写在主题后面，同权重时它压过美化主题，切底色立刻见效。 */
      ".sk-bg-night .mes_text{background:#16181d;color:#e8e4d9;border:1px solid #2a2e36;border-radius:8px;padding:10px 12px}" +
      ".sk-bg-night .mes_text b{color:#e0b968}.sk-bg-night .mes_text i{color:#a8c8d8}";
    pdoc.head.appendChild(st);
    shotState.css = true;
  } catch (e) {}
}
/* 从图标往上找到它属于哪条消息。
   ★ 不能写死 parentNode.parentNode —— 图标现在挂在 .mes_text 里（避开酒馆自带的
     .mes_buttons），在某些主题下气泡可能再套一层，写死的层数就找不回 .mes。 */
function shotMesOf(el) {
  try {
    if (el && el.closest) { var m = el.closest(".mes"); if (m) return m; }
  } catch (e) {}
  var p = el;
  for (var i = 0; p && i < 6; i++) {
    p = p.parentNode;
    if (p && p.classList && p.classList.contains("mes")) return p;
  }
  return null;
}
/* 造一颗图标：class + 图标 + 提示 + 点击。
   ★ 每个图标自带 handler，不靠面板那层委托 —— 图标挂在主文档的 .mes 上，
     跟面板的委托链压根不在一块（这是「球/面板点不到」那类的老坑）。 */
function shotIco(cls, svg, title, onClick) {
  var i = pdoc.createElement("i");
  i.className = cls; i.title = title; i.innerHTML = svg;
  i.addEventListener("click", function (ev) {
    ev.preventDefault(); ev.stopPropagation();
    try { onClick(ev); } catch (e) { ownErr(e); }
  });
  return i;
}
function shotOpsMake(m) {
  var ops = pdoc.createElement("div");
  ops.className = "sk-shot-ops";
  /* ★★ 挂 .mes 直接子节点（不放 .mes_text）。理由见 shotCSS 里的说明：
     气泡内容会被流式输出整块重写，挂里面的图标活不过一段输出。 */
  m.appendChild(ops);
  try { shotOpsPlace(m, ops); } catch (eP) { }
  return ops;
}
/* 图标列按开关对齐：缺哪颗补哪颗、多的摘掉。返回 1＝这条消息动过（0＝本来就对）。
   ★ 返回值口径必须跟以前一样是 0/1（心跳那行「补挂 N 条」和测试都按「几条消息」数），
     别改成「动了几颗图标」—— 一颗星加两颗按钮会数成 3，日志就成了假账。
   ★ 不整列拆了重建：重建会把整列节点换掉，正在点的那颗当场被抽走（也更容易闪）。
   顺序固定【收藏 → 相机 → 复制】。他说过「复制要更靠下，别误触下一页生成」，
   所以新图标一律往前插，复制永远钉在最后一颗。 */
/* 这条是不是「我自己发的」。
   ★★ v1.9 他原话：「那些星星照相复制的图标，我输入那个界面不要有，不然它会占掉我编辑那个地方，
      只在系统消息那里显示，用户消息不显示。」→ 那一排只挂 AI 回复，自己发的一条都不挂。
   ★ 认两个口径：现在酒馆是 `.mes[is_user="true"]` 属性；老版本 / 部分主题还用过 `.is_user` 类名。
     两个都判，别只认一个（跟 .mes_name 那次栽的坑一个道理：只认一个就有一半认不出来）。 */
function shotIsMine(m) {
  try {
    if (!m) return false;
    var v = String(m.getAttribute && m.getAttribute("is_user") || "").toLowerCase();
    if (v === "true" || v === "1") return true;
    if (m.classList && m.classList.contains("is_user")) return true;
  } catch (e) {}
  return false;
}
function shotOpsSync(m) {
  /* ★ 自己的消息：有图标就摘掉，不新挂 */
  if (shotIsMine(m)) {
    var mine = m.querySelector(".sk-shot-ops");
    if (mine) { mine.remove(); return 1; }
    return 0;
  }
  var wantFav = !!favCfg.on, wantShot = !!shotCfg.on;
  var ops = m.querySelector(".sk-shot-ops");
  if (!wantFav && !wantShot) { if (ops) { ops.remove(); return 1; } return 0; }
  var add = 0;
  if (!ops) { ops = shotOpsMake(m); add = 1; }
  /* 刚挂上那拍还没排版好（rect 全是 0）→ 下一拍补量一次。
     ★ 盖上 data-skpl 就不再量：300 条聊天不会每拍都去 getBoundingClientRect（那是卡的老病根）。 */
  if (!ops.getAttribute("data-skpl")) {
    try { shotOpsPlace(m, ops); } catch (eP2) { ownErr(eP2); }
  }
  var fv = ops.querySelector(".sk-fv"), sh = ops.querySelector(".sk-sh"), cp = ops.querySelector(".sk-cp");
  if (wantFav && !fv) {
    fv = shotIco("sk-fv", FAV_SV.star, "收藏这一条（再点取消）", function (ev) {
      favToggle(shotMesOf(ev.currentTarget));
    });
    ops.insertBefore(fv, ops.firstChild);
    add = 1;
  }
  if (!wantFav && fv) { fv.remove(); fv = null; add = 1; }
  if (wantShot && !sh) {
    sh = shotIco("sk-sh", SHOT_SV.cam, "截图这一条消息（存进手机下载）", function (ev) {
      shotDo(shotMesOf(ev.currentTarget));
    });
    ops.insertBefore(sh, cp || null);
    add = 1;
  }
  if (wantShot && !cp) {
    cp = shotIco("sk-cp", SHOT_SV.cp, "复制这条消息的文字内容", function (ev) {
      shotCopy(shotMesOf(ev.currentTarget));
    });
    ops.appendChild(cp);
    add = 1;
  }
  if (!wantShot) { if (sh) { sh.remove(); add = 1; } if (cp) { cp.remove(); add = 1; } }
  return add;
}
/* 主题 / 底色跟着配置走（所见即所得）。
   ★ 拆出来单独跑：这一档只是加个 class，一条消息几微秒，可以【全量】对齐；
     图标那一档要给每条消息造 3 个节点，只能给看得见的挂（理由见 shotNear）。 */
function shotSkin(m) {
  var want = (shotCfg.on && shotCfg.thm) ? "sk-thm-" + shotCfg.thm : "";
  var cur = m.getAttribute("data-skthm") || "";
  if (cur !== want) {
    if (cur) m.classList.remove(cur);
    if (want) m.classList.add(want);
    m.setAttribute("data-skthm", want);
  }
  /* 底色：日间＝不加任何气泡样式（酒馆原本什么样就什么样），
     夜间＝给 .mes_text 套黑底浅字。类名挂在 .mes 上，SVG 序列化时跟着一起带走。 */
  var wantBg = shotCfg.on ? "sk-bg-" + shotCfg.bg : "";
  var curBg = m.getAttribute("data-skbg") || "";
  if (curBg !== wantBg) {
    if (curBg) m.classList.remove(curBg);
    if (wantBg) m.classList.add(wantBg);
    m.setAttribute("data-skbg", wantBg);
  }
}
/* 处理一条消息：缺图标就补、主题/底色类名对齐、收藏状态对齐。返回 0/1（动了几下）。
   ★ 拆出来是为了让「全扫」和「增量」共用同一套判定，不会两边跑偏。 */
function shotOne(m) {
  if (!m) return 0;
  var add = 0;
  try { add += shotOpsSync(m); } catch (eAdd) { ownErr(eAdd); }
  m.setAttribute("data-skshot", "1");
  /* 收藏状态：只有真挂着星才去查（没星就不用碰收藏夹）。
     ★ 一律从「收藏夹」倒推，别信 DOM 上的 class —— 在收藏页删掉几条之后，
       聊天里那些星得自己变回空心（这是「时有时无」那类不一致的老坑）。 */
  var fv = m.querySelector(".sk-fv");
  if (fv) {
    var on = !!favKeys()[favKeyOf(m)];
    if ((m.getAttribute("data-skfav") === "1") !== on) favMark(m, on);
  }
  try { shotSkin(m); } catch (eSk) { ownErr(eSk); }
  return add;
}
/* 把图标顶到「气泡底边之上」——.mes 底部还压着酒馆自带的 .mes_buttons，
   按死在 bottom:14px 就会跟那排按钮叠一起（老毛病「布局混乱」）。
   实测一次气泡底边到 .mes 底边的距离就够了：这个距离正好是按钮那排的高度，
   而且【跟正文长短无关】，所以算一次就永远有效，正文再长也不用重算。 */
/* 图标列摆位（v2.5 定稿 —— 他 2026-11-14 拍照提的两条）
   ★★ 他的原话：「复制键的按钮被下面这个重新生成的按钮挡着了，我要你把它调到最底部，
      然后这些按钮给我调小一点」。
   老做法的病：靠「气泡底边 → .mes 底边」的距离反推按钮那排有多高，再把整列顶上去。
   可那排按钮并不总在这段距离里（有的主题是绝对定位、有的被负 margin 拔高），
   量出来偏小 → 整列正好压在那排按钮上，最下面的复制那颗被挡。
   现在：
     ① 贴底 —— 整列 bottom:2px，永远贴着 .mes 的最下沿（他要的「最底部」）；
     ② 避让 —— 实测酒馆那排按钮（.mes_buttons）的【左边界】，把整列挪到它左边。
        同一高度、左右错开，两层永远不叠。
        只认「贴着右边、竖着的窄列」（宽度 < 消息宽的 45%）：有些主题那排是整行宽的，
        那种情况硬挪会把图标甩到消息左边去 —— 量不准就不动，宁可按 right:8px 叠一点点。
   返回 true ＝ 这次真量出来了。量不出来（还没排版好）就别盖标记，下一拍再补一次。 */
function shotOpsPlace(m, ops) {
  if (!m || !ops || !m.getBoundingClientRect) return false;
  var mr = m.getBoundingClientRect();
  if (!mr.height || !mr.width) return false;          /* 还没渲染出来 → 用 CSS 兜底值 */
  ops.style.bottom = "2px";
  var right = 8;
  var btns = m.querySelector(".mes_buttons");
  if (btns && btns.getBoundingClientRect) {
    var br = btns.getBoundingClientRect();
    if (br.width > 2 && br.height > 2 && br.width < mr.width * 0.45) {
      var r = Math.round(mr.right - br.left) + 6;
      if (r > 8) right = r;
    } else if (!br.width && !br.height) {
      /* 那排这会儿藏着（酒馆是「点一下才显出来」）→ 按一列的宽度先给它留好位置。
         不留的话，他一按消息、那排冒出来，正好又盖住最下面那颗复制。 */
      right = 42;
    }
  }
  var maxR = Math.round(mr.width) - 26;               /* 20px 图标 + 6px 余量：不许挤出左边界 */
  if (maxR > 8 && right > maxR) right = maxR;
  ops.style.right = right + "px";
  ops.setAttribute("data-skpl", "1");
  return true;
}
/* ── 只给「看得见的那几条」挂图标（2026-11-13 他原话「滑动聊天时卡」） ────
   ★★ 老做法为什么卡（真机实测）：全扫时给**每一条** .mes 都挂图标列，
     300 条聊天 = 300 个 .sk-shot-ops + 900 个 <i> + 900 个 <svg>。
     光这一棵树就够手机掉帧了（加上早年的 opacity 合成层，见文件头第 143 行）。
   ★ 新做法：滑动时一颗都不挂；手指停下 300ms 才给【视口内】的消息挂，
     滑出去的当场摘掉；最新 SHOT_NEAR 条常驻（刚生成完那条必须能立刻点星）。
     300 条聊天实测挂载节点 900 → 12~24 个，跟历史多长无关。
   ★ 主题/底色（data-skthm / data-skbg）仍然【全量】对齐：那只是 class，不值钱；
     只给视口内加的话，老消息滑上来会当场变色，闪一下更难看。 */
var SHOT_NEAR = 4;        /* 最新几条常驻挂图标（他定的 4） */
var SHOT_PAD = 260;       /* 视口上下各预留的预热距离（px）：快滑到的提前挂好，滚起来不空一截 */
/* 摘掉一条消息的图标列（滑出视口时用）。返回 1＝真摘了。 */
function shotStrip(m) {
  var ops = m.querySelector ? m.querySelector(".sk-shot-ops") : null;
  if (ops) { try { ops.remove(); } catch (e) {} return 1; }
  return 0;
}
/* 只处理「最新 SHOT_NEAR 条 + 视口内（含预热带）」。返回「动过的消息条数」。
   ★ 返回值口径跟老 shotScan 一致（按条数，不按图标颗数），心跳日志接着用。 */
function shotNear(chat) {
  var got = !!chat;
  if (!chat) chat = pdoc.getElementById("chat");
  if (!chat || !chat.querySelectorAll) return 0;
  /* 面板开着的时候聊天根本看不见：别去量 300 条消息的尺寸（那是「点编辑框卡死」的来源）。
     显式传 chat 的调用（测试 / 关面板后的补扫）照常走。 */
  if (!got && shotPaneOn()) return 0;
  var mes = chat.querySelectorAll(".mes"), n = mes.length, i;
  if (!n) { shotState.nearAdd = 0; shotState.nearDrop = 0; return 0; }
  var cr = null;
  try { cr = chat.getBoundingClientRect(); } catch (e0) { cr = null; }
  var vh = pwin.innerHeight || 0;
  /* chat 自己不滚（或还没渲染出来，高度 0）时，退到「整个窗口」这个口径 */
  var useWin = !cr || !cr.height;
  var top = (useWin ? 0 : cr.top) - SHOT_PAD;
  var bot = (useWin ? vh : cr.bottom) + SHOT_PAD;
  var keep = n - SHOT_NEAR;          /* 从这一条起（含）永远挂 */
  var add = 0, drop = 0;
  for (i = 0; i < n; i++) {
    var m = mes[i], want = i >= keep;
    if (!want) {
      try {
        var r = m.getBoundingClientRect();
        /* 高度 0＝还没排版 / display:none：不挂（真在屏幕上的不会有 0 高度）。
           量不出来就按「要挂」处理——宁可多挂一条，也不能让屏幕上的消息没星。 */
        want = r.height > 0 ? (r.bottom >= top && r.top <= bot) : false;
      } catch (eR) { want = true; }
    }
    if (want) add += shotOne(m);
    else drop += shotStrip(m);
  }
  shotState.nearAdd = add; shotState.nearDrop = drop;
  return add;
}
/* 全扫：样式全量对齐 + 图标只给看得见的挂。
   full=false 只核末尾 3 条 —— ★ 这条路【一次 querySelectorAll 都不跑】，
   从 lastElementChild 往前数就行，成本恒定，跟聊天有 30 条还是 500 条无关。 */
function shotScan(full) {
  if (!shotCfg.on && !favCfg.on) return 0;
  var chat = pdoc.getElementById("chat"); if (!chat) return 0;
  if (full === undefined) full = true;
  /* ⚠ 记 children.length（不是 .mes 条数）：shotRescan 拿它判「变了没」，
     两边口径必须一致，否则永远判成变了 → 每拍退化成全扫。 */
  shotState.mesN = chat.children ? chat.children.length : -1;
  var add = 0;
  if (full) {
    /* ★ 全扫往往意味着「换了聊天 / 换了角色」→ 出处缓存必须作废，
       否则新聊天的收藏会顶着旧聊天名当 key，跟旧聊天互相顶掉。 */
    _favCtx = null;
    var list = chat.querySelectorAll(".mes"), i;
    for (i = 0; i < list.length; i++) { try { shotSkin(list[i]); } catch (eS) { } }
    return shotNear(chat);
  }
  var el = chat.lastElementChild, k = 0, guard = 0;
  while (el && k < 3 && guard < 30) {
    guard++;
    if (el.classList && el.classList.contains("mes")) { add += shotOne(el); k++; }
    el = el.previousElementSibling;
  }
  return add;
}
/* 面板开着的时候，聊天被盖住了 —— 这时候扫一遍纯属白烧：
   ★★ 2026-11-13「点开编辑框直接卡死」的真凶就在这里。
     点正文 → 键盘弹起 → 页面跟着滚一下 → 这里的 scroll 监听被叫醒 →
     对聊天里每一条 .mes 跑一遍 getBoundingClientRect（300 条就是 300 次强制布局）
     → 手机上直接卡死。所以：面板开着就整段跳过；面板里滚（编辑框、列表）也不理。
   ★ 面板关掉时 closePanel 会补一次全扫，图标不会因此丢。 */
function shotPaneOn() {
  try { return !!(pdoc.documentElement && pdoc.documentElement.classList.contains("sk-pm-open")); }
  catch (e) { return false; }
}
/* 滚动监听：滑动时什么都不做，停下来 300ms 才重算「哪几条在屏幕上」。 */
function shotScrollBind() {
  if (shotState.scRoll) return false;
  try {
    shotState.scFn = function (ev) {
      if (shotPaneOn()) return;                    /* 面板开着 → 一律不管 */
      var t = ev && ev.target, chat = pdoc.getElementById("chat");
      var inChat = !!(chat && t && t !== pdoc && t !== pwin
        && (t === chat || (chat.contains && chat.contains(t))));
      /* 只有「聊天自己滚」和「整页滚」才算数；面板/其它容器的滚动跟聊天无关 */
      var isWin = !t || t === pdoc || t === pwin
        || t === pdoc.documentElement || t === pdoc.body;
      if (!inChat && !isWin) return;
      clearTimeout(shotState.st);
      shotState.st = setTimeout(function () {
        try { if (!shotPaneOn()) shotNear(pdoc.getElementById("chat")); } catch (eS) { ownErr(eS); }
      }, 300);
    };
    pdoc.addEventListener("scroll", shotState.scFn, true);
    shotState.scRoll = true;
    return true;
  } catch (e) { shotState.scFn = null; return false; }
}
function shotScrollUnbind() {
  if (shotState.st) { clearTimeout(shotState.st); shotState.st = 0; }
  if (shotState.scRoll && shotState.scFn) {
    try { pdoc.removeEventListener("scroll", shotState.scFn, true); } catch (e) {}
  }
  shotState.scRoll = false; shotState.scFn = null;
}
function shotUninstall() {
  try {
    var chat = pdoc.getElementById("chat"); if (!chat) return;
    /* 全量扫 .mes（不按标记找）：标记可能跟真实 DOM 对不上，漏一条就留个野图标 */
    var mes = chat.querySelectorAll(".mes"), i;
    for (i = 0; i < mes.length; i++) {
      var m = mes[i];
      var ops = m.querySelector(".sk-shot-ops"); if (ops) ops.remove();
      var th = m.getAttribute("data-skthm");
      if (th) m.classList.remove(th);
      var bg = m.getAttribute("data-skbg");
      if (bg) m.classList.remove(bg);
      m.removeAttribute("data-skshot"); m.removeAttribute("data-skthm");
      m.removeAttribute("data-skbg"); m.removeAttribute("data-skfav");
    }
  } catch (e) {}
  shotState.mesN = -1;          /* 停用后条数缓存作废，下次开启必须整片重扫 */
  shotScrollUnbind();           /* 停用了就别再听滚动（留着就是白烧电的白听） */
}
/* 有变化了才扫，而且先看「消息条数变没变」：
   条数变了（新消息 / 加载历史 / 换聊天）→ 全量扫一次；
   条数没变（流式输出在重写正文）→ 只核末尾 3 条，成本恒定。
   这样即便一次生成吐了几百段，也只在开头补一次图标，不会每段重建。 */
function shotRescan() {
  if (!shotCfg.on && !favCfg.on) return 0;
  var chat = pdoc.getElementById("chat"); if (!chat) return 0;
  /* ★ 条数用 children.length 判（HTMLCollection 的长度是缓存的，几乎零成本）；
     querySelectorAll('.mes') 在 300 条聊天里要几十毫秒，不能每拍都跑。 */
  var n = chat.children ? chat.children.length : -1;
  if (n !== shotState.mesN) return shotScan(true);
  return shotScan(false);
}
/* observer 必须挂在【当前这个】#chat 元素上。换聊天 / 切角色时酒馆会整个换掉
   #chat 节点，挂在旧节点上的 observer 从此收不到任何动静，图标就再也不补了 ——
   这也是「时有时无」的一条来源。心跳里每拍核一次，换了就重挂。 */
function shotWatch() {
  if (!shotCfg.on && !favCfg.on) return false;
  shotScrollBind();          /* 滚动也归这条心跳管：两项都关时不该有人听 */
  if (!pwin.MutationObserver) return false;
  var chat = pdoc.getElementById("chat"); if (!chat) return false;
  if (shotState.obs && shotState.obsOn === chat) return false;
  if (shotState.obs) { try { shotState.obs.disconnect(); } catch (e0) {} shotState.obs = null; }
  try {
    shotState.obs = new pwin.MutationObserver(function () {
      clearTimeout(shotState.t);
      /* 150ms 去抖：流式输出一段一段来，攒一批再补，别每段都动 DOM */
      shotState.t = setTimeout(function () {
        try { shotRescan(); } catch (eR) { ownErr(eR); }
      }, 150);
    });
    shotState.obs.observe(chat, { childList: true, subtree: true });
    shotState.obsOn = chat;
    return true;
  } catch (e) {
    shotState.obs = null; shotState.obsOn = null;
    return false;
  }
}
function shotApply() {
  if (!shotState.css) shotCSS();
  /* ★ 2026-11-13 收藏：图标列现在归两项共用（截图 / 收藏各自一个开关）。
     只要有一项开着就得挂列、开 observer；两项都关才整列拆掉。 */
  if (shotCfg.on || favCfg.on) { shotScan(true); shotWatch(); }
  else {
    if (shotState.obs) { try { shotState.obs.disconnect(); } catch (e) {} shotState.obs = null; }
    shotState.obsOn = null;
    shotUninstall();
  }
}
/* 心跳兜底：observer 万一漏了（节点被换掉、观察器被主题干扰），心跳里核一次。
   ★ 2026-11-13 改：不再是「每拍全扫」——
     全扫在 300 条聊天里要几十毫秒（实测 36ms/拍），2.5 秒一次就是持续的卡顿来源。
     现在只做两件几乎零成本的事：① #chat 换了就重挂 ② 条数变了才全量扫。
     真·生成期间的补挂，交给 observer（条数没变 → 末尾 3 条，恒定开销）。 */
function shotTick() {
  /* ★ 收藏也共用这条心跳（它同样靠图标列），所以判的是「两项都关才不跑」 */
  if ((!shotCfg.on && !favCfg.on) || !pwin.SillyTavern) return;
  try {
    /* 切到后台（另一屏 / 锁屏）就别扫了，纯烧电 */
    if (pdoc.hidden) return;
    var re = shotWatch();
    var n = 0;
    if (re) n = shotScan(true);            /* #chat 刚被换掉 → 必须整片重来 */
    else n = shotRescan();
    if (n > 0 && shotCfg.on) shotLog("补挂", "心跳补上 " + n + " 条消息的图标"
      + (re ? "（#chat 刚被换掉，observer 已重挂）" : "（observer 这次漏了）"));
  } catch (eTick) { errSave(ownErr(eTick)); }
}
/* ── 截图渲染：★ 不用 html2canvas ──
   ★★ 为什么换掉（真机 11-03：手机上一按直接卡死）：
     html2canvas 会把整棵 DOM 重新解析、逐个元素按 CSS 重画一遍。scale=3 时，
     一条长回复在手机上就是 1200×6000+ 的画布、几十万次绘制 —— 手机直接卡死。
     他让我参考的小剧场插件（character-theatre）那份能用的样本也是绕开它的：
     离屏 SVG foreignObject → 交给浏览器把 SVG 画进 canvas。
   ★ 这条路线好在哪：**放大只是把同一张 SVG 按更高分辨率栅格化，不会重跑 DOM 布局**，
     所以「清晰度」调高也不会变慢 —— 它慢的只有一次 SVG 解析。
   ⚠ 三个必须做的保护（小剧场那份没做全，所以它老掉到兜底）：
     ① 图片必须先转 dataURL：foreignObject 里引用外部资源，Safari 会**整张拒绝渲染**
     ② 内容要按 XML 序列化（不能拿 innerHTML 直接塞）：`<br>` 不闭合、`&nbsp;`
        这类 HTML 实体在 XML 里都非法，会让整张 SVG 解析失败
     ③ 画布有上限：超过手机扛得住的像素就自动降倍数（见 shotScale）
   万一这条路还不通 → shotTextPNG：纯 canvas 画文字，怎么着都能出一张图。 */
/* 900 万而不是 1600 万 ★（11-03 真机教训）：1600 万像素的 PNG 能到 20~40 MB，
   手机上的下载器和内存根本吃不下 —— 表现就是「点了截图，转头弹一句带 blob 地址的
   下载失败」。宁可少一点像素，也要让这张图真的落进「下载」。 */
var SHOT_MAXPX = 9000000;       /* 画布总像素上限（超了手机直接白屏/崩） */
var SHOT_MAXSIDE = 8000;        /* 单边上限 */
var SHOT_MAXB = 10 * 1024 * 1024;   /* 出图体积上限：超了自动降一档重画，不超就照原样 */
var SHOT_W = 560;               /* 出图的逻辑宽度（竖屏好读） */
/* ★ 清晰度倍数：先按设置来，再被手机能力压回来。
     长消息最容易被压（高 × 长 = 像素爆表），压了会在 toast 里说明，不闷声降。 */
function shotScale(w, h) {
  var s = Math.min(4, Math.max(1, +shotCfg.dpi || 2));
  var area = (w || 1) * (h || 1);
  if (area > 0) s = Math.min(s, Math.sqrt(SHOT_MAXPX / area), SHOT_MAXSIDE / Math.max(w || 1, h || 1));
  /* ⚠ 下限不能设太高：设 0.5 的话遇到极长消息（h>16000）会反过来把画布顶过上限，
     等于保护失效。0.2 这个下限只在「几万像素高」的极端情况才可能碰到。 */
  return Math.max(0.2, Math.min(4, s));
}
/* 克隆体上的清理：按钮、脚本、输入框这些不该出现在图里。
   ★ 小剧场那份只清了 button —— 酒馆的 .mes_buttons（编辑/删除/继续）一整排会进图，
     我们自己的截图/复制图标也会进图，所以这两个必须一起清掉。 */
/* ── 展开 Shadow DOM（v2.2，真凶就在这儿）────────────────────────────
   ★★ 他 2026-11-13 23:31 报「正文有图、截出来只有文字」，查了两轮：
      柏宝绘（baibai-git/ST-BaiBai-Image）把卡片挂在 .mes_text 里一个锚点上，
      整套图渲染在 `anchor.attachShadow({mode:'open'})` 里面
      （源码 src/floor/hydrate.ts 第 78 行，锚点选择器 BBI_SLOT_SELECTOR）。
   ★ 为什么以前怎么修都不管用：cloneNode / querySelectorAll / XMLSerializer
     这三样**都不会进 shadow root**，所以：
       · querySelectorAll('img') 搜到 0 张 → failN=0 → 提示里不报「图没画进去」
       · 序列化出来的 SVG 里一个 <img> 都没有 → 图从来没进过 SVG，
         不是「画不出来」，改压缩参数、改 foreignObject 全是白改。
     电脑和手机一样中招，跟 WebView 无关（之前当成手机问题猜了一轮）。
   ★ 修法：克隆完之后按索引一一对应（cloneNode 保证子节点顺序完全一致），
     凡是原节点有 shadowRoot 的，就在克隆体对应位置挖一个普通 <div>，
     把 shadow 里的 <style>（:host 改成我们的类名）+ 所有子节点抄进去。
     ⚠ 必须在 shotClean 之前跑：抄进来的 <img> 要留给 shotInline 去压缩内联。
     ⚠ 只认 open 模式 —— closed 的 el.shadowRoot 恒为 null，拿不到，只能放过。 */
/* ★★ v2.3 主图铺满正文宽度
   他 2026-11-14 发的截图：文字满宽，图只占一半，要求「图的宽度和聊天的那些对齐」。
   根子有两层：
     ① 容器宽度被锁窄（见 shotShadowInline 里那段注释）—— 主因；
     ② 卡片自己的写法是「宽跟随内容」：stage{width:fit-content} + img{width:auto;
        max-height:var(--bbi-figure-max-h)}，高度封顶 → 宽度按比例回缩。
        就算容器对了，只改 img 也撑不满（100% 是相对 fit-content 的父级）。
   所以这里挑 shadow 里**面积最大**的那张当主图，把 img 和它的祖先链一路解开到 100%。
   为什么按面积挑：卡片里还有 ⋯ 钮、翻页器、角标这些小图，一起放大就花了。
   ⚠ 原节点在页面上、克隆体还不在，量尺寸必须用原 shadow 里的 img（同一顺序）。
   ⚠ 数量对不上就整个放弃 —— 宁可不放大，也不能把 A 图当主图。 */
function shotWiden(box, sr) {
  var mine = null, org = null, k;
  try {
    mine = box.querySelectorAll("img");
    org = sr.querySelectorAll("img");
  } catch (e) { return 0; }
  if (!mine.length || mine.length !== org.length) return 0;
  var big = -1, area = 0;
  for (k = 0; k < org.length; k++) {
    var r = null;
    try { r = org[k].getBoundingClientRect(); } catch (e2) { r = null; }
    if (!r) continue;
    var a = (r.width || 0) * (r.height || 0);
    if (a > area) { area = a; big = k; }
  }
  if (big < 0 || area < 100) return 0;      /* 全是小图标就不动（100px² 以下当图标） */
  var im = mine[big];
  if (!im) return 0;
  function S(el, p, v) { try { el.style.setProperty(p, v, "important"); } catch (e) {} }
  S(im, "width", "100%");
  S(im, "height", "auto");
  S(im, "max-width", "100%");
  S(im, "max-height", "none");
  /* 祖先链：stage 的 fit-content、卡片定宽盒子，光改 img 都会被它们卡住 */
  var p = im.parentElement, guard = 0;
  while (p && p !== box && guard++ < 6) {
    S(p, "width", "100%");
    S(p, "max-width", "100%");
    S(p, "min-width", "0");
    S(p, "max-height", "none");
    p = p.parentElement;
  }
  /* 标记：shotInline 的 sizeIt 看到就别再按 rect 锁 px，否则又被锁回窄的 */
  try { im.setAttribute("data-sk-full", "1"); } catch (e3) {}
  return 1;
}
function shotShadowInline(mes, cl) {
  var src = null, dst = null, n = 0, i;
  try {
    src = mes.querySelectorAll("*");
    dst = cl.querySelectorAll("*");
    /* 结构对不上就别硬塞 —— 位置错开比漏图更糟（会把 A 的图贴到 B 的楼里） */
    if (!src.length || src.length !== dst.length) return 0;
  } catch (e) { return 0; }
  for (i = 0; i < src.length; i++) {
    var sr = null;
    try { sr = src[i].shadowRoot; } catch (e1) { sr = null; }
    if (!sr) continue;
    try {
      var box = pdoc.createElement("div");
      box.className = "sk-shd-host";
      var k, sts = sr.querySelectorAll("style");
      for (k = 0; k < sts.length; k++) {
        var st = pdoc.createElement("style");
        /* :host 在普通 DOM 里没人认 → 换成我们自己的类名，卡片外框才不至于全塌 */
        st.textContent = String(sts[k].textContent || "").replace(/:host\b/g, ".sk-shd-host");
        box.appendChild(st);
      }
      /* 有的打包器不写 <style>，而是塞 adoptedStyleSheets —— 一样得抄 */
      try {
        var ad = sr.adoptedStyleSheets || [];
        for (k = 0; k < ad.length; k++) {
          var cw = "", rules = ad[k].cssRules || [];
          for (var r = 0; r < rules.length; r++) cw += rules[r].cssText + "\n";
          if (cw) {
            var st2 = pdoc.createElement("style");
            st2.textContent = cw.replace(/:host\b/g, ".sk-shd-host");
            box.appendChild(st2);
          }
        }
      } catch (e4) {}
      var kids = sr.childNodes;
      for (k = 0; k < kids.length; k++) {
        var nd = kids[k];
        if (nd.nodeType === 1 && String(nd.tagName).toLowerCase() === "style") continue;
        box.appendChild(nd.cloneNode(true));
      }
      /* ★★ v2.3：宽度只能跟着容器走，绝不许按锚点 rect 锁 px
         他 2026-11-14 原话：「酒馆里那个图片的宽度就和文字对齐，是你截图之后它才显得
         没那么对齐、才只占一半」。
         真因就是 v2.2 这里：shadow 内容不参与父级布局 → 锚点 rect 往往只有卡片真实
         宽度的一个零头（柏宝绘的 stage 是 fit-content）。把它当兜底宽度钉成 px，
         整个卡片就被锁窄，img{max-width:100%} 只能跟着窄一半。
         box 是 block，width:100% 在普通流里就是父容器宽，不需要也不许量锚点。 */
      box.style.cssText = "display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;";
      /* 主图强制铺满（卡片原样是 fit-content + max-height 反推宽度，不主动解开永远不满） */
      shotWiden(box, sr);
      dst[i].appendChild(box);
      n++;
    } catch (e3) {}
  }
  return n;
}
function shotClean(cl) {
  var ns = cl.querySelectorAll("button,.mes_buttons,.sk-shot-ops,script,style,noscript,"
    + "iframe,video,audio,textarea,input,select,svg");
  for (var i = 0; i < ns.length; i++) { try { ns[i].remove(); } catch (e) {} }
}
/* ── 图片内联（v1.8 重写）───────────────────────────────────────────────
   ★★ 他 2026-11-13 的原话：「我要是生成了那些图片，他看都不会看一眼」。
      真因不在「截不截得到」，在于截出来的图**掉到了纯文字兜底**：
      老代码见到 src 已经是 data: 就直接放行、跳过压缩 —— 可现在图片消息本身就是
      一大串 base64。一张 4K 的 base64 PNG 原样塞进 SVG，字符串几十 MB，
      foreignObject 必然解析失败 → 整条走 shotTextPNG → 图上一个字没有，只剩文字。
   ★ 现在【所有】图片（不管 data: / blob: / 相对路径 / 外链）一律走同一条路：
      拿到原始字节 → 解码 → 最长边缩到 SHOT_IMG_MAX → 重编码 JPEG。
      几十 MB 压到几百 KB，SVG 才解析得动，图才画得进去。
   ★ 三级兜底：fetch→blob→FileReader（最稳，不碰 canvas 跨域污染）
              → Image 直载（同源）
              → 都不行就保留原址并在截图后如实报「有几张没画进去」。
   ⚠ 不许再对 data: 走捷径 —— 那就是这个 bug 的成因。 */
var SHOT_IMG_MAX = 1080;          /* 单张图最长边：够看清，又不会把 SVG 撑爆 */
function shotImgData(src, cb) {
  var fin = false, tm = 0;
  function done(u) { if (fin) return; fin = true; clearTimeout(tm); cb(u || ""); }
  tm = setTimeout(function () { done(""); }, 9000);   /* 单张最多等 9 秒（解码大图要时间） */

  /* 解码 + 缩放 + 重编码。跨域污染时 toDataURL 会抛 → 算失败，交给上层兜底 */
  function enc(el) {
    try {
      var w = el.naturalWidth || el.width || 0, h = el.naturalHeight || el.height || 0;
      if (!w || !h) { done(""); return; }
      var sc = (w > SHOT_IMG_MAX || h > SHOT_IMG_MAX) ? SHOT_IMG_MAX / Math.max(w, h) : 1;
      var c = pdoc.createElement("canvas");
      c.width = Math.max(1, Math.round(w * sc));
      c.height = Math.max(1, Math.round(h * sc));
      var g = c.getContext("2d");
      if (!g) { done(""); return; }
      g.drawImage(el, 0, 0, c.width, c.height);
      done(c.toDataURL("image/jpeg", 0.9));
    } catch (e) { done(""); }
  }
  function dec(u) {
    var im = new pwin.Image();
    im.onload = function () { enc(im); };
    im.onerror = function () { done(""); };
    try { im.src = u; } catch (e) { done(""); }
  }
  /* ① 先把原始字节抓成 dataURL：自包含，不可能有跨域污染，也不会因为相对路径失配 */
  var viaBlob = function () {
    try {
      if (typeof pwin.fetch !== "function") return false;
      pwin.fetch(src, { cache: "force-cache" }).then(function (r) {
        if (!r || (r.ok === false)) throw new Error("http " + (r && r.status));
        return r.blob();
      }).then(function (b) {
        if (!b) throw new Error("no blob");
        var fr = new pwin.FileReader();
        fr.onload = function () { dec(String(fr.result || "")); };
        fr.onerror = function () { dec(src); };
        fr.readAsDataURL(b);
      })["catch"](function () { dec(src); });   /* ② 抓不到就直载原址 */
      return true;
    } catch (e) { return false; }
  };
  if (!viaBlob()) dec(src);
}
/* 把克隆体里的 <img> 全部换成本地 dataURL，并锁死显示尺寸。
   ★ 锁尺寸是必须的：克隆体要插进隐藏容器量高度（shotRaster 里），
     那时 dataURL 图可能还没解码完，高度会被算小 → 图被裁掉一截。
     先按原节点在屏幕上的真实 rect 写好 width/height，布局就稳了。 */
function shotInline(mes, cl, cb) {
  var imgs = cl.querySelectorAll("img");
  var n = imgs.length;
  var srcs = null;
  try { srcs = mes ? mes.querySelectorAll("img") : null; } catch (e) {}
  var left = n, fin = false, failN = 0, okN = 0;
  function go() { if (fin) return; fin = true; clearTimeout(tm); cb(failN, okN, n); }
  var tm = setTimeout(go, 15000);            /* 总量兜底：再慢也不能把人晾着 */
  if (!n) { go(); return; }

  function sizeIt(im, i) {
    /* ★ v2.3：影子盒子里搬出来的主图已经强制铺满了（!important width:100%），
       这里再按 rect 锁 px 会把它锁回窄的 —— 而且 srcs 索引本来就跟 shadow 对不上。 */
    try { if (im.getAttribute("data-sk-full") === "1") return; } catch (e0) {}
    var se = srcs ? srcs[i] : null, r = null;
    try { r = se ? se.getBoundingClientRect() : null; } catch (e) {}
    if (!r || !(r.width > 2) || !(r.height > 2)) return;
    var maxW = SHOT_W - 32, w = r.width, h = r.height;
    if (w > maxW) { h = h * maxW / w; w = maxW; }
    w = Math.round(w); h = Math.round(h);
    im.setAttribute("width", w); im.setAttribute("height", h);
    im.style.width = w + "px"; im.style.height = h + "px";
    im.style.objectFit = "contain";
  }

  for (var i = 0; i < n; i++) (function (im, idx) {
    /* ★ 懒加载的图真址在 data-src / data-original 里，src 只是个占位图；
       不认这两个属性的话，截出来就是一堆灰色小方块（v1.8） */
    var src = im.getAttribute("src") || "";
    var alt = im.getAttribute("data-src") || im.getAttribute("data-original") || "";
    if (alt) src = alt;              /* 有真址就用真址，src 那会儿多半只是占位图 */
    if (!src) { if (--left <= 0) go(); return; }
    shotImgData(src, function (u) {
      if (u) {
        okN++;
        im.setAttribute("src", u);
        im.removeAttribute("loading");       /* dataURL 不需要懒加载，留着反而可能不画 */
        /* 尺寸按压缩后的真实比例重算一次（裁剪框 / object-fit 都不会变形） */
        sizeIt(im, idx);
      } else {
        failN++;
        /* 真拿不到：留个可见的空框，总比整段文字凭空消失好认 */
        if (!/^data:/.test(src)) im.setAttribute("src", src);
      }
      if (--left <= 0) go();
    });
  })(imgs[i], i);
}
/* ★ 样式必须内联进 SVG —— 外部 CSS 在 foreignObject 里完全不生效，
     不内联的话截出来就是一堆裸标签（黑字白底，什么美化都没有）。 */
var SHOT_CSS =
  /* ★ 11-04 默认日间白底。以前这一整段是 #16181d 黑底浅字（他截出来一片黑），
     现在把那套深色配色整个搬到末尾的 .sk-bg-night 里当可选底色。 */
  ".sk-shot-wrap{background:#ffffff;color:#2b2b2b;padding:14px 16px;box-sizing:border-box;"
  + "font:15px/1.75 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;word-break:break-word}"
  + ".sk-shot-wrap *{max-width:100%;box-sizing:border-box}"
  + ".sk-shot-wrap p{margin:0 0 10px}"
  + ".sk-shot-wrap img{max-width:100%;height:auto;display:block;margin:8px 0;border-radius:8px}"
  + ".sk-shot-wrap b,.sk-shot-wrap strong{color:#8a6420;font-weight:700}"
  + ".sk-shot-wrap i,.sk-shot-wrap em{color:#7a4f8a}"
  + ".sk-shot-wrap blockquote{margin:10px 0;padding:8px 12px;border-left:3px solid #b8944a;"
  + "background:rgba(184,148,74,.08);border-radius:0 6px 6px 0;color:#5c5344}"
  + ".sk-shot-wrap code{background:rgba(0,0,0,.06);padding:1px 5px;border-radius:4px;"
  + "font:13px/1.6 monospace}"
  + ".sk-shot-wrap pre{margin:10px 0;padding:10px 12px;background:rgba(0,0,0,.045);border-radius:8px;"
  + "white-space:pre-wrap;font:13px/1.65 monospace}"
  + ".sk-shot-wrap ul,.sk-shot-wrap ol{margin:8px 0;padding-left:22px}"
  + ".sk-shot-wrap h1,.sk-shot-wrap h2,.sk-shot-wrap h3{color:#8a6420;margin:12px 0 8px;font-size:17px}"
  + ".sk-shot-wrap a{color:#2a6496;text-decoration:none}"
  + ".sk-shot-wrap .mes_name{font-weight:700;color:#8a6420;margin:0 0 8px;font-size:14px}"
  + ".sk-shot-wrap .mes_avatar{width:46px;height:46px;border-radius:50%;float:left;"
  + "margin:0 10px 6px 0;object-fit:cover}"
  /* 主题：卡片 */
  + ".sk-shot-wrap.sk-thm-card{background:#fdfbf5;color:#3a3226;border-radius:12px;"
  + "border-left:5px solid #b8944a}"
  + ".sk-shot-wrap.sk-thm-card b,.sk-shot-wrap.sk-thm-card strong{color:#8a6420}"
  + ".sk-shot-wrap.sk-thm-card i,.sk-shot-wrap.sk-thm-card em{color:#7a4f8a}"
  + ".sk-shot-wrap.sk-thm-card .mes_name{color:#8a6420}"
  + ".sk-shot-wrap.sk-thm-card blockquote{background:rgba(184,148,74,.10);border-left-color:#b8944a;color:#5c5344}"
  + ".sk-shot-wrap.sk-thm-card pre{background:rgba(0,0,0,.06)}"
  /* 主题：信纸 */
  + ".sk-shot-wrap.sk-thm-paper{background:#f7f2e7;color:#41392c;border-radius:3px;padding:18px 20px;"
  + "font-family:Georgia,'Noto Serif SC',serif;line-height:1.9}"
  + ".sk-shot-wrap.sk-thm-paper b,.sk-shot-wrap.sk-thm-paper strong{color:#7a4a1a}"
  + ".sk-shot-wrap.sk-thm-paper .mes_name{color:#7a4a1a}"
  + ".sk-shot-wrap.sk-thm-paper blockquote{background:rgba(122,74,26,.08);border-left-color:#7a4a1a;color:#5a4f3c}"
  /* 主题：夜读（深色主题要把 code / pre / 标题 / 链接也补齐，不然白底基础上会漏出亮块） */
  + ".sk-shot-wrap.sk-thm-night{background:#101418;color:#a8c8b0;border-radius:10px}"
  + ".sk-shot-wrap.sk-thm-night b,.sk-shot-wrap.sk-thm-night strong{color:#7ec98f}"
  + ".sk-shot-wrap.sk-thm-night i,.sk-shot-wrap.sk-thm-night em{color:#6a9ab0}"
  + ".sk-shot-wrap.sk-thm-night .mes_name{color:#7ec98f}"
  + ".sk-shot-wrap.sk-thm-night code{background:rgba(255,255,255,.08)}"
  + ".sk-shot-wrap.sk-thm-night pre{background:rgba(0,0,0,.35)}"
  + ".sk-shot-wrap.sk-thm-night h1,.sk-shot-wrap.sk-thm-night h2,.sk-shot-wrap.sk-thm-night h3{color:#7ec98f}"
  + ".sk-shot-wrap.sk-thm-night a{color:#8ab4d8}"
  + ".sk-shot-wrap.sk-thm-night blockquote{background:rgba(126,201,143,.08);border-left-color:#7ec98f;color:#8fae97}"
  /* ── 底色：夜间黑底（就是 11-04 之前那套默认配色，现在变成可选项）──
     ★ 必须写在【所有主题之后】：选择器权重跟 .sk-thm-* 同级，靠顺序压过去。
       这样「底色」是独立于美化的总开关，选卡片 / 信纸时也能一键切成黑底，
       不会出现「黑底 + 深色字」那种看不清的混搭。 */
  + ".sk-shot-wrap.sk-bg-night{background:#16181d;color:#e8e4d9}"
  + ".sk-shot-wrap.sk-bg-night b,.sk-shot-wrap.sk-bg-night strong{color:#e0b968}"
  + ".sk-shot-wrap.sk-bg-night i,.sk-shot-wrap.sk-bg-night em{color:#a8c8d8}"
  + ".sk-shot-wrap.sk-bg-night blockquote{background:rgba(255,255,255,.05);border-left-color:#b8944a;color:#cfcabc}"
  + ".sk-shot-wrap.sk-bg-night code{background:rgba(255,255,255,.08)}"
  + ".sk-shot-wrap.sk-bg-night pre{background:rgba(0,0,0,.35)}"
  + ".sk-shot-wrap.sk-bg-night h1,.sk-shot-wrap.sk-bg-night h2,.sk-shot-wrap.sk-bg-night h3{color:#e0b968}"
  + ".sk-shot-wrap.sk-bg-night a{color:#8ab4d8}"
  + ".sk-shot-wrap.sk-bg-night .mes_name{color:#e0b968}";
/* 把内容包成一张 SVG。★ 用 XMLSerializer 而不是 innerHTML：
   XML 不认 `<br>`（必须自闭合）、也不认 `&nbsp;` 这类 HTML 实体，
   直接塞 innerHTML 会让整张 SVG 解析失败 —— 序列化出来的则是干净的 XHTML。 */
function shotBuildSVG(cl, w, h) {
  var inner = "";
  try { inner = new pwin.XMLSerializer().serializeToString(cl); } catch (e) {}
  if (!inner) {
    /* 实在拿不到就退回 innerHTML，并把 void 元素补成自闭合（XML 才认） */
    inner = String(cl.innerHTML || "").replace(
      /<(br|hr|img|input|meta|link|source|area|base|col|embed|param|track|wbr)\b([^>]*?)>/gi,
      function (m, tag, at) { return /\/\s*$/.test(at) ? m : "<" + tag + at + " />"; });
  }
  var thm = shotCfg.thm ? " sk-thm-" + shotCfg.thm : "";
  var bg = " sk-bg-" + shotCfg.bg;      /* 底色类名：日间白底 / 夜间黑底，切了立刻生效 */
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">'
    + '<foreignObject width="100%" height="100%">'
    + '<div xmlns="http://www.w3.org/1999/xhtml" class="sk-shot-wrap' + thm + bg + '"'
    + ' style="width:' + w + 'px;min-height:' + h + 'px;box-sizing:border-box;">'
    + '<style>' + SHOT_CSS + '</style>' + inner + '</div></foreignObject></svg>';
}
/* ★★ 11-04 真机日志钉死的根因：他的 Android 12 / Chrome 97 WebView 里
     `pwin.URL.createObjectURL` **不是函数**（酒馆助手那个上下文把 URL 覆盖了），
     日志原话：「中文名：pwin.URL.createObjectURL is not a function」。
   于是：SVG 一开局就抛错 → 降级成纯文字 → 保存时又抛同一个错 → 两条失败记录。
   ★ 所以整条截图链【不许再假设】createObjectURL 存在：
     能喂给 <img> / <a> 的地址，要么 blob: URL，要么直接就是 data: URL。 */
function shotURL() { try { return pwin.URL || pwin.webkitURL || null; } catch (e) { return null; } }
function shotCanURL() {
  try { var U = shotURL(); return !!(U && typeof U.createObjectURL === "function"); }
  catch (e) { return false; }
}
/* SVG 字符串 → 能喂给 <img src> 的地址。
   ⚠ data: 那条路必须 encodeURIComponent：SVG 里有 # & 中文和引号，原样拼会把 URL 截断。 */
function shotSvgSrc(svg) {
  if (shotCanURL()) {
    try {
      var U = shotURL(), b = new pwin.Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      var u = U.createObjectURL(b);
      return { src: u, clear: function () { try { U.revokeObjectURL(u); } catch (e) {} } };
    } catch (e) {}
  }
  return { src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
           clear: function () {} };
}
/* Blob / dataURL → 能塞进 <a href> 的地址。
   ★ 没有 createObjectURL 时用 FileReader 把 Blob 读成 dataURL ——
     Android WebView 上最稳的一条，不碰任何被覆盖的 URL 静态方法，也不碰文件系统。 */
function shotHref(src, cb) {
  if (typeof src === "string") { cb(src, function () {}); return; }   /* 本来就是 dataURL */
  if (shotCanURL()) {
    try {
      var U = shotURL(), u = U.createObjectURL(src);
      cb(u, function () { try { U.revokeObjectURL(u); } catch (e) {} });
      return;
    } catch (e) {}
  }
  try {
    var fr = new pwin.FileReader();
    fr.onload = function () { cb(String(fr.result || ""), function () {}); };
    fr.onerror = function () { cb("", function () {}); };
    fr.readAsDataURL(src);
    return;
  } catch (e) {}
  cb("", function () {});
}
/* 主路：SVG → canvas → 图片。失败/超时都走 fail（由调用方切到纯文本兜底）。 */
function shotRaster(mes, cl, ok, fail) {
  var host = null;
  try {
    host = pdoc.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;"
      + "width:" + SHOT_W + "px;box-sizing:border-box;z-index:-1;";
    host.appendChild(cl);
    pdoc.body.appendChild(host);
    var w = Math.max(200, Math.min(SHOT_W, host.scrollWidth || SHOT_W));
    var h = Math.max(120, host.scrollHeight || 300);
    var svg = shotBuildSVG(cl, w, h);
    host.remove(); host = null;
    /* ★ v2.1 诊断：SVG 里到底带了几个 <img> —— 这一条能把两条路彻底分开：
       「SVG 里 img=0」→ 克隆时就丢了图（DOM 结构问题）；
       「SVG 里 img>0 但成图没图」→ 图进去了、画不出来（foreignObject 渲染问题）。 */
    shotLog("SVG", "画布 " + w + "x" + h + "，字符串 " + Math.round(svg.length / 1024)
      + "KB，里面 img=" + ((svg.match(/<img[\s/>]/gi) || []).length));

    /* ★ 不再直接调 createObjectURL：他的 WebView 上没有这个函数（真机日志实锤） */
    var ref = shotSvgSrc(svg);
    var img = new pwin.Image(), fin = false;
    var clear = function () { try { ref.clear(); } catch (e) {} };
    var lose = function () { if (fin) return; fin = true; clear(); shotLog("SVG失败", "img.onerror / 超时（SVG " + Math.round(svg.length / 1024) + "KB）"); fail(); };
    img.onload = function () {
      if (fin) return;
      try {
        var jpg = (shotCfg.fmt === "jpg"), mime = jpg ? "image/jpeg" : "image/png";
        /* ★ 出图后先看体积：太大就按体积等比降一档重画（只重画画布，SVG 不用再解析一遍）。
           ★★ 为什么非得有这一步：十几 MB 的图在手机上，下载器要么写到一半断掉、
              要么直接把内存打爆 —— 弹出来的就是那句带 blob 地址的「下载失败」。
              所以「宁可降一点清晰度，也要真的存下来」。 */
        var shoot = function (sc, again) {
          var c = pdoc.createElement("canvas");
          c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
          var g = c.getContext("2d");
          if (jpg) { g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(img, 0, 0, c.width, c.height);
          var q = (jpg && again) ? 0.8 : 0.92;
          var got = function (bb) {
            if (fin) return;
            /* 老 WebView 没有 canvas.toBlob 时，got 拿到的是 dataURL **字符串** ——
               体积按 base64 长度折算，别再用 bb.size（undefined 会让体积保护整个失效） */
            var sz = (typeof bb === "string") ? Math.round(bb.length * 0.75) : ((bb && bb.size) || 0);
            if (bb && sz > SHOT_MAXB && !again && sc > 0.4) {
              shoot(Math.max(0.4, sc * Math.sqrt(SHOT_MAXB / sz) * 0.9), true);
              return;
            }
            fin = true; clear();
            if (bb) ok(bb, sc); else fail();
          };
          if (c.toBlob) c.toBlob(got, mime, q);
          else got(c.toDataURL(mime, q));   /* ★ 直接给 dataURL，不再绕 Blob（老 WebView 上 atob 未必全） */
        };
        shoot(shotScale(w, h), false);
      } catch (e) { ownErr(e); lose(); }
    };
    img.onerror = lose;
    img.src = ref.src;
    setTimeout(lose, 12000);                       /* 整体超时：卡住也不能一直卡着 */
  } catch (e) {
    if (host) { try { host.remove(); } catch (e2) {} }
    ownErr(e); fail();
  }
}
/* 兜底：纯 canvas 画文字。SVG 那条路在某些 iOS 上对 foreignObject 挑得很，
   这条保证「怎么着都能出一张图」—— 顶上有说话人横幅，正文自动换行不截断。 */
function shotTextPNG(mes) {
  try {
    var tx = shotMesText(mes);
    if (!tx) return null;
    var who = shotWho(mes);
    var W = SHOT_W, pad = 24, lh = 30, fsz = 16, banner = 46;
    var c0 = pdoc.createElement("canvas");
    var g0 = c0.getContext("2d"); if (!g0) return null;
    g0.font = fsz + "px sans-serif";
    var lines = [], ps = String(tx).split(/\r?\n/), i, seg, cut;
    for (i = 0; i < ps.length; i++) {
      seg = ps[i] || " ";
      while (g0.measureText(seg).width > W - pad * 2 && seg.length > 1) {
        cut = seg.length - 1;
        while (cut > 1 && g0.measureText(seg.slice(0, cut)).width > W - pad * 2) cut--;
        lines.push(seg.slice(0, cut)); seg = seg.slice(cut);
      }
      lines.push(seg);
    }
    var H = Math.max(160, banner + pad * 2 + lines.length * lh);
    var sc = shotScale(W, H);
    var c = pdoc.createElement("canvas");
    c.width = Math.max(1, Math.round(W * sc)); c.height = Math.max(1, Math.round(H * sc));
    var g = c.getContext("2d"); if (!g) return null;
    /* ★ 兜底图也得跟着「底色」走 —— 不然主路白底、降级却吐一张黑图，会以为是 bug */
    var isNight = (shotCfg.bg === "night");
    g.scale(sc, sc);
    g.fillStyle = isNight ? "#16181d" : "#ffffff"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#b8944a"; g.fillRect(0, 0, W, banner);
    g.fillStyle = "#16181d"; g.font = "bold 15px sans-serif"; g.textBaseline = "middle";
    g.fillText(who, pad, banner / 2);
    g.fillStyle = isNight ? "#e8e4d9" : "#2b2b2b"; g.font = fsz + "px sans-serif"; g.textBaseline = "alphabetic";
    var y = banner + pad;
    for (i = 0; i < lines.length; i++) { g.fillText(lines[i], pad, y); y += lh; }
    return c.toDataURL("image/png");
  } catch (e) { ownErr(e); return null; }
}
function shotMesText(mes) {
  if (!mes) return "";
  var sels = [".mes_text", ".mes_text_inner", ".mes_block"], i, n, v;
  for (i = 0; i < sels.length; i++) {
    try {
      n = mes.querySelector(sels[i]);
      if (n) { v = String(n.innerText || n.textContent || "").trim(); if (v) return v; }
    } catch (e) {}
  }
  return String(mes.innerText || mes.textContent || "").trim();
}
function shotWho(mes) {
  /* ★ 用 mesWhoOf 统一取名字：这里以前也只认 .mes_name，截出来的图上标题全是「消息」
     （跟收藏同一个根因，2026-11-13 一起修）。 */
  var who = "", fl = "";
  try {
    who = mesWhoOf(mes);
    fl = mes.getAttribute("mesid") || "";
  } catch (e) {}
  if (!who) who = "消息";
  return who + (fl ? " · 第 " + fl + " 楼" : "");
}
function dataURLToBlob(u) {
  try {
    var a = String(u).split(","), mime = (a[0].match(/:(.*?);/) || [])[1] || "image/png";
    var bin = pwin.atob(a[1] || ""), n = bin.length, arr = new pwin.Uint8Array(n);
    for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
    return new pwin.Blob([arr], { type: mime });
  } catch (e) { ownErr(e); return null; }
}
function shotDo(mes) {
  if (!mes) return;
  if (!shotCfg.on) return;
  /* 上一张没出完就别再点：手机上连点两下最容易把内存打爆（这也是卡死的一种） */
  if (shotState.busy) { toast("上一张还在出，稍等一下"); return; }
  shotState.busy = true;
  shotState.imgFail = 0;
  toast("正在截图…");
  var done = function () { shotState.busy = false; };
  var cl = mes.cloneNode(true);
  /* ★ v2.2：必须在 shotClean / shotInline 之前展开 shadow —— 柏宝绘的图全在里面，
     不搬出来后面两个函数都当它不存在（这就是「提示成功、图上却没图」的真凶）。 */
  var shdN = shotShadowInline(mes, cl);
  shotClean(cl);
  /* ★ v2.1 诊断：先把这条消息的真实结构记下来（img / svg / canvas / 背景图各几个），
     再记「克隆体里找到了几张、压缩成功几张」。他截一张图，日志里就有现场。 */
  shotLog("诊断", shotDomDump(mes) + " shadow展开=" + shdN);
  shotInline(mes, cl, function (failN, okN, total) {
      /* ★ 图没画进去要如实说（v1.8）：闷声少几张，他会以为「截图又没带着图」 */
      shotState.imgFail = failN || 0;
      shotLog("图", "克隆体 img=" + (total || 0) + " 张：压缩成功 " + (okN || 0)
        + " / 失败 " + (failN || 0) + "；原始图数=" + ((mes.querySelectorAll("img") || {}).length || 0));
      shotRaster(mes, cl, function (blob, sc) {
      done(); shotSaveBlob(mes, blob, sc);
    }, function () {
      shotLog("降级", "SVG 那条路没出成图（"
        + (shotCanURL() ? "createObjectURL 可用" : "createObjectURL 不可用 → 已走 data: URL")
        + "），改走纯文字兜底");
      var u = shotTextPNG(mes);
      done();
      if (u) shotSaveBlob(mes, u, 0, true);
      else { shotLog("失败", "纯文字兜底也没出图（这条消息取不到文字）"); toast("这条出不了图 —— 点下面那个方块能把文字复制走"); }
    });
  });
}
/* ★ 只走内存 → 浏览器下载 → 手机「下载」文件夹。
   ★★ 他特意强调过：旧版明明只该进「下载」，结果应用自己的系统目录里也堆了一堆图 ——
     所以这里从头到尾不碰应用目录，连一个临时文件都不落，用完 revoke 连内存一起放掉。 */
function shotSaveBlob(mes, src, sc, isText) {
  if (!src) { shotLog("失败", "图没生成出来（内容为空）"); toast("生成图片失败"); return; }
  var jpg = (shotCfg.fmt === "jpg" && !isText), ext = jpg ? "jpg" : "png";
  var isStr = (typeof src === "string");
  /* 体积：Blob 用 size；dataURL 按 base64 长度折算（老 WebView 直接给字符串时） */
  var sizeB = isStr
    ? Math.round(Math.max(0, src.length - (src.indexOf(",") + 1)) * 0.75)
    : (+src.size || 0);
  var kb = sizeB / 1024;
  var d = new Date(), p2 = function (n) { return (n < 10 ? "0" : "") + n; };
  var stamp = p2(d.getHours()) + p2(d.getMinutes());
  /* 文件名剔掉下载器不认的字符（\ / : * ? " < > |）；中文留着 —— 他要能一眼看懂是哪个 */
  var safe = function (s) { return String(s).replace(/[\\/:*?"<>|]/g, "_"); };
  var name = safe("酒馆_第" + (mes.getAttribute("mesid") || "?") + "楼_" + stamp) + "." + ext;
  var en = "tavern_" + (mes.getAttribute("mesid") || "0") + "_" + stamp + "." + ext;
  var sizeTx = kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.round(kb) + " KB";
  var msg = "已截图 · 存进手机「下载」：" + name + "（" + sizeTx + "）";
  /* 清晰度被手机上限压回来了要说明白 —— 闷声降会被当成「画质变差了」 */
  if (sc && sc < (+shotCfg.dpi || 2) - 0.01) msg += " · 这条太长，清晰度自动降到 " + sc.toFixed(1) + "×";
  if (isText) msg += "（纯文字版）";
  /* ★ v1.8：有几张图画不进去就直说，别让他对着图找半天 */
  if (shotState.imgFail) msg += " · 有 " + shotState.imgFail + " 张图没画进去（多半是外链不让抓）";
  /* ★★ 先把图变成能塞进 <a href> 的地址：
     有 createObjectURL → blob:；没有（他的 Android WebView）→ FileReader 读成 data:。
     全程内存，不碰酒馆 data 目录、不落临时文件。 */
  shotHref(src, function (href, release) {
    var how = href.indexOf("data:") === 0 ? "dataURL" : "blob";
    if (!href) {
      shotLog("失败", "图转不出可下载的地址（createObjectURL 不可用、FileReader 也没读出来）"
        + " ｜ " + sizeTx);
      toast("保存失败 · 去截图页签点「复制日志」把这段发给我");
      return;
    }
    var put = function (nm) {
      var a = pdoc.createElement("a");
      a.href = href; a.download = nm; a.rel = "noopener";
      a.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px";
      /* 下载动作放在主页面（pdoc / pwin 指向 parent，不是脚本自己那个小 iframe） */
      pdoc.body.appendChild(a); a.click(); a.remove();
    };
    var okSave = function (nm, note) {
      shotLog("成功", nm + " · " + sizeTx + (sc ? " · " + sc.toFixed(1) + "×" : "")
        + (isText ? " · 纯文字版" : "") + " · " + how + (note ? " · " + note : ""));
      toast(msg);
      /* ★★ 60 秒后才撤（以前 8 秒，下载器还没读完就中断了）；
         dataURL 那条路 release 是空函数，调了也无害 */
      setTimeout(function () { try { release(); } catch (e) {} }, 60000);
    };
    try { put(name); okSave(name); }
    catch (e1) {
      /* 兜底：换纯英文名再来一次（少数下载器不认中文名 / 特殊字符） */
      try { put(en); okSave(en, "中文名被拒：" + (e1 && e1.message)); }
      catch (e2) {
        ownErr(e2);
        shotLog("失败", "中文名：" + (e1 && e1.message) + " ｜ 英文名：" + (e2 && e2.message)
          + " ｜ " + sizeTx + " ｜ " + how + " ｜ " + (sc ? sc.toFixed(1) + "×" : "?"));
        /* 报错一闪而过复制不了 —— 只留一句指引，详情在截图页签的「复制日志」里 */
        toast("保存失败（" + sizeTx + "）· 去截图页签点「复制日志」把这段发给我");
        try { release(); } catch (e3) {}
      }
    }
  });
}
function shotCopy(mes) {
  if (!mes) return;
  var tx = mes.querySelector(".mes_text");
  var v = tx ? (tx.innerText || tx.textContent || "") : "";
  v = String(v).trim();
  if (!v) { toast("这条消息没有文字"); return; }
  copyTextTo(v, "已复制这条消息的内容（" + v.length + " 字）");
}
/* =====================================================================
   收藏（2026-11-13 他提的：截图既然都有了，顺手能收藏这段聊天）
     ① 消息右下角那一列图标里加一颗星（放最上；复制仍然钉最下，不误触「下一页」）
     ② 点星 = 收藏 / 取消收藏这一条；星变实心金色
     ③ 想一次收好几条：收藏页签 →「从当前聊天挑几条」→ 全屏勾选页
     ④ 每条存：谁说的 + 正文 + 时间 + 出处（角色卡 · 聊天名）
     ⑤ 存 localStorage（PFX 前缀，跟别的配置一个命名空间）；收藏页签能看，
        能导出 md 到手机「下载」（跟截图同一条下载链，不弹窗、不写酒馆 data）
   ★ 容量：localStorage 一般 5MB。聊天记录是把它吃满的头号大户，所以有上限：
     条数 600、单条 20000 字（超了截断并在正文后标「已截断」）。
   ===================================================================== */
var FAV_K = "fav", FAV_CFG_K = "favcfg";
var FAV_MAX = 600, FAV_MAXLEN = 20000;
var FAV_SV = {
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.7l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75L6.8 19.7l1-5.8-4.2-4.1 5.8-.85z"/></svg>'
};
var favCfg = { on: true };
(function () {
  var c = lsJSON(FAV_CFG_K, null);
  if (c && typeof c === "object" && c.on !== undefined) favCfg.on = !!c.on;
})();
function favSaveCfg() { lsSetJSON(FAV_CFG_K, favCfg); }
/* 收藏夹缓存：聊天里有几百条消息，每次都 JSON.parse 一遍会拖慢扫描
   （跟 shotScan 那条「别每拍全扫」是同一个道理）。写的时候一起更新。 */
var _favCache = null, _favKeys = null, _favCtx = null;
function favAll() {
  if (_favCache) return _favCache;
  var a = lsJSON(FAV_K, []);
  _favCache = (a && a.push) ? a : [];
  return _favCache;
}
function favStore(a) {
  _favCache = a; _favKeys = null;
  try { lsSetJSON(FAV_K, a); return true; } catch (e) { return false; }
}
function favKeys() {
  if (_favKeys) return _favKeys;
  var a = favAll(), o = {}, i;
  for (i = 0; i < a.length; i++) o[a[i].key] = 1;
  _favKeys = o;
  return o;
}
/* 一条消息「是谁说的」。
   ★★ 2026-11-13 他报「收藏之后名字全显示成『消息』」——真根因就在这里：
      以前只认 `.mes_name`，那是我自己造 SVG 时用的类名，**酒馆真实聊天里根本没有**。
      酒馆的 DOM 是 `.mes > .mes_block > .ch_name > .name_text`（名字在 .name_text 里），
      取不到就一路掉到 `who || "消息"` —— 于是所有角色都变成「消息」。
      所以这里按真实结构逐层兜底，绝不能只认一个类名。
      ⚠ 改这里之前先开酒馆 F12 看一眼 .mes 里面到底叫什么，别再凭想象写选择器。 */
function mesWhoOf(m) {
  if (!m) return "";
  var sels = [".name_text", ".ch_name .name_text", ".ch_name", ".mes_name", ".name"];
  var i, n, v;
  for (i = 0; i < sels.length; i++) {
    try {
      n = m.querySelector(sels[i]);
      if (n) { v = String(n.textContent || "").replace(/\s+/g, " ").trim(); if (v) return v; }
    } catch (e) {}
  }
  return "";
}
/* 出处：角色卡名 + 聊天名 + 那份 chat 数组（取发送时间要用）。
   ★ 不走 _ctxCache：那个缓存取一次就再也不刷新了，换聊天后聊天名会一直是老的
     （收藏的 key 里带聊天名，用错名字 = 不同聊天的收藏互相顶掉）。
   ★★ 2026-11-13 他报「点那颗星卡住不动」——以前 favCtx 和 favTimeOf **各自**
      调一次 SillyTavern.getContext()，而这个是重函数（要把 characters / chat /
      所有扩展设置都拼一遍）。点一次星 = 问两遍 = 手机上肉眼可见地顿一下。
      现在合成一次，并且 3 秒内复用（换聊天时 shotScan 会 _favCtx = null 主动作废）。
   ★ 角色卡名以前只认 pwin.this_chid —— TauriTavern 那边它在主窗口上，iframe 里
      常是 undefined，于是 char 空 → 分组名退成「消息」。现在 name2 / this_chid /
      characters 三条路都试。 */
var _favCtxAt = 0;
function favCtx() {
  var now = Date.now();
  if (_favCtx && now - _favCtxAt < 3000) return _favCtx;
  var char = "", chat = "", arr = null, c = null;
  try {
    if (pwin.SillyTavern && typeof pwin.SillyTavern.getContext === "function") {
      c = pwin.SillyTavern.getContext();
    }
  } catch (e0) {}
  try {
    if (c && c.name2) char = String(c.name2);
    if (!char) {
      var ci = (c && c.this_chid !== undefined) ? c.this_chid : pwin.this_chid;
      var ch = (c && c.characters) || pwin.characters;
      if (ch && ci !== undefined && ci !== null && ch[ci]) char = String(ch[ci].name || "");
    }
  } catch (e) {}
  try { if (c) chat = c.chatId || c.chat_file_name || ""; } catch (e2) {}
  try { if (c && c.chat && c.chat.length) arr = c.chat; } catch (e3) {}
  if (chat) chat = String(chat).replace(/\.jsonl?$/i, "");
  _favCtx = { char: String(char || ""), chat: String(chat || ""), chatArr: arr };
  _favCtxAt = now;
  return _favCtx;
}
/* ★ 消息编号在每场聊天里都是从 0 数起的，光用 mesid 会把不同聊天的第 3 楼认成一条。
   所以 key 必须带聊天标识。 */
function favKeyOf(mes) {
  var c = favCtx(), mid = "";
  try { mid = mes.getAttribute("mesid") || ""; } catch (e) {}
  if (mid === "") mid = "@" + (Array.prototype.indexOf.call(
    (mes.parentNode ? mes.parentNode.children : []), mes));
  return (c.chat || c.char || "-") + "#" + mid;
}
/* 消息自带的发送时间在 chat 数组里（DOM 上没有），取不到就退回收藏时刻。
   ★ 走 favCtx() 里那份缓存，不再单独调 getContext —— 点一次星只问酒馆一次。 */
function favTimeOf(mes) {
  try {
    var id = mes.getAttribute("mesid");
    var arr = favCtx().chatArr;
    if (arr && id !== null && arr[+id] && arr[+id].send_date) return arr[+id].send_date;
  } catch (e) {}
  return new Date().toISOString();
}
function favTimeTx(s) {
  var d = new Date(String(s == null ? "" : s).replace(" ", "T"));
  if (!d || isNaN(d.getTime())) return String(s || "").slice(0, 16);
  var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate())
    + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
}
function favMark(mes, on) {
  if (!mes) return;
  mes.setAttribute("data-skfav", on ? "1" : "0");
  var i = mes.querySelector(".sk-fv");
  if (i) {
    i.classList.toggle("on", !!on);
    i.title = on ? "已收藏（再点取消）" : "收藏这一条";
  }
}
/* 往数组里塞一条（不落盘）：返回 ok / dup / full / empty */
function favPush(mes, a) {
  var key = favKeyOf(mes), i;
  for (i = 0; i < a.length; i++) if (a[i].key === key) return "dup";
  if (a.length >= FAV_MAX) return "full";
  var text = shotMesText(mes);
  if (!text) return "empty";
  var cut = false;
  if (text.length > FAV_MAXLEN) { text = text.slice(0, FAV_MAXLEN); cut = true; }
  var who = mesWhoOf(mes);
  var c = favCtx(), mid = "";
  try { mid = mes.getAttribute("mesid") || ""; } catch (e2) {}
  a.unshift({
    key: key, mid: mid, who: who || "消息", text: text, cut: cut,
    t: favTimeOf(mes), at: Date.now(), char: c.char, chat: c.chat,
    /* ★ 2026-11-13 新加的两个字段（老收藏没有，读的地方一律 f.title||"" / f.tags||[] 兜底，
       不做迁移）：title = 自己起的名字，tags = 自由标签。 */
    title: "", tags: []
  });
  return "ok";
}
function favToggle(mes) {
  if (!mes) return;
  var a = favAll(), key = favKeyOf(mes), i;
  for (i = 0; i < a.length; i++) if (a[i].key === key) break;
  if (i < a.length) {
    a.splice(i, 1);
    if (favStore(a)) { favMark(mes, false); toast("已取消收藏 · 还剩 " + a.length + " 条"); }
    else toast("取消收藏没写进去 —— 本地存储可能满了");
    return;
  }
  var r = favPush(mes, a);
  if (r === "ok") {
    if (favStore(a)) { favMark(mes, true); toast("已收藏 " + a.length + " 条 · 在「收藏」页签看"); }
    else { a.shift(); _favCache = a; _favKeys = null; toast("存不进去 —— 收藏夹满了，去收藏页删几条"); }
    return;
  }
  if (r === "full") toast("收藏夹满了（" + FAV_MAX + " 条），去收藏页删几条");
  else if (r === "empty") toast("这条没有文字，收不了");
  else toast("这条已经在收藏里了");
}
/* 通用「存一个文本文件到手机下载」：跟截图同一条路（内存 → <a download> → 下载目录），
   ★ 不弹窗、不写酒馆 data 目录 —— 这是他特意强调过的两条。 */
function saveTextFile(name, text, mime) {
  try {
    /* ★ 太长的 data: URL 会让手机下载器直接不理（几千条收藏 = 几 MB 中文，编码后翻三倍）。
       到这条线就明说，别让他看着「点了没反应」。 */
    if (String(text).length > 1200000) {
      toast("这份太大了（" + Math.round(String(text).length / 10000) + " 万字），先删几条再导");
      return false;
    }
    var u = "data:" + (mime || "text/plain") + ";charset=utf-8," + encodeURIComponent(text);
    var a = pdoc.createElement("a");
    a.href = u; a.download = name; a.rel = "noopener";
    a.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px";
    pdoc.body.appendChild(a); a.click(); a.remove();
    return true;
  } catch (e) { ownErr(e); return false; }
}
/* 导出 md：跟界面一样按角色分组，标题用你自己起的名字。
   ★ 名字没起就写「（未命名）」，不要拿正文前十个字当标题 —— 导出后拿它当目录用会认不出来。 */
function favMD(a) {
  var gs = favGroupsOf(a);
  var s = "# 收藏\n\n";
  s += "> 导出时间 " + favTimeTx(new Date().toISOString())
    + " · 共 " + a.length + " 条 · " + gs.length + " 个角色\n\n";
  for (var k = 0; k < gs.length; k++) {
    var g = gs[k];
    s += "\n## " + g.name + "（" + g.rows.length + " 条）\n\n";
    for (var i = 0; i < g.rows.length; i++) {
      var f = g.rows[i].f;
      var named = !!(f.title && String(f.title).trim());
      s += "### " + (named ? String(f.title).trim() : "（未命名）") + "\n\n";
      var meta = [f.who || "消息", favTimeTx(f.t)];
      var src = [f.char, f.chat].filter(Boolean).join(" · ");
      if (src && src !== g.name) meta.push(src);
      s += "*" + meta.join(" · ") + "*\n\n";
      if (f.tags && f.tags.length) s += "标签：" + f.tags.join(" / ") + "\n\n";
      s += f.text + (f.cut ? "\n\n_（这条太长，收藏时截断了）_" : "") + "\n\n";
    }
    s += "---\n\n";
  }
  return s;
}
function favExport() {
  var a = favAll();
  if (!a.length) { toast("收藏夹是空的"); return; }
  var d = new Date(), p2 = function (n) { return (n < 10 ? "0" : "") + n; };
  var stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "_" + p2(d.getHours()) + p2(d.getMinutes());
  var nm = "酒馆收藏_" + stamp + ".md";
  if (saveTextFile(nm, favMD(a), "text/markdown")) toast("已导出 · 存进手机「下载」：" + nm);
  else toast("导出失败 · 存储被浏览器拦了");
}
var favSel = {};                        /* 勾选页：key → 1 */
function favSelCount() { var n = 0, k; for (k in favSel) if (favSel[k]) n++; return n; }
/* 全屏勾选页：把当前聊天的消息列出来，一条一行带勾选框。
   ★ 最多列最近 300 条 —— 再多手机上滚动就是折磨，而且收藏夹本来就装不下那么多。 */
function sheetFavSel() {
  var chat = pdoc.getElementById("chat");
  var list = chat ? chat.querySelectorAll(".mes") : [];
  var n = list.length, start = Math.max(0, n - 300);
  var ks = favKeys(), rows = "", i;
  for (i = start; i < n; i++) {
    var m = list[i], key = favKeyOf(m), who = mesWhoOf(m), tx = "";
    tx = shotMesText(m).replace(/\s+/g, " ").slice(0, 80);
    var on = !!favSel[key], has = !!ks[key];
    rows += '<div class="fvpick' + (on ? " on" : "") + (has ? " has" : "") + '" data-fvsel="' + escAttr(key) + '">'
      +   '<span class="bx">' + (on ? SV.check : "") + "</span>"
      +   '<span class="pi"><span class="pw">' + esc(who || "消息")
      +     (has ? '<i class="dd">已收藏</i>' : "") + "</span>"
      +     '<span class="pt">' + esc(tx) + "</span></span>"
      + "</div>";
  }
  return '<div data-edbox="fav">'
    + sheetHead("从聊天里挑几条")
    + '<div class="sarea fcarea">'
    +   '<div class="smeta" style="flex:none"><span>勾选要收藏的消息 · 最近 '
    +     (n - start) + " 条" + (start > 0 ? "（更早的 " + start + " 条没列出来）" : "") + "</span></div>"
    +   '<div class="fvpicks">' + (rows || '<div class="empty">当前聊天里没有消息</div>') + "</div>"
    + "</div>"
    + '<div class="sft"><div class="srow">'
    +   '<button class="btn go" data-fvok="1" style="flex:1">收藏选中的 ' + favSelCount() + " 条</button>"
    + "</div></div></div>";
}
function favPickOpen() {
  if (!pdoc.getElementById("chat")) { toast("还没进聊天 —— 先打开一个角色再说"); return; }
  favSel = {};
  sheetShow("f");
}
function favSelSync() {
  var s = sheetEl(); if (!s) return;
  var bs = s.querySelectorAll("[data-fvsel]"), i;
  for (i = 0; i < bs.length; i++) {
    var k = bs[i].getAttribute("data-fvsel"), on = !!favSel[k];
    bs[i].classList.toggle("on", on);
    var bx = bs[i].querySelector(".bx");
    if (bx) bx.innerHTML = on ? SV.check : "";
  }
  var ok = s.querySelector("[data-fvok]");
  if (ok) ok.textContent = "收藏选中的 " + favSelCount() + " 条";
}
function favBulkAdd() {
  var chat = pdoc.getElementById("chat"); if (!chat) return;
  var list = chat.querySelectorAll(".mes"), a = favAll(), i;
  var ok = 0, dup = 0, empty = 0, full = 0;
  for (i = list.length - 1; i >= 0; i--) {        /* 从新往旧塞，收藏夹里就是「最新在最上」 */
    if (!favSel[favKeyOf(list[i])]) continue;
    var r = favPush(list[i], a);
    if (r === "ok") ok++;
    else if (r === "dup") dup++;
    else if (r === "full") { full++; break; }
    else empty++;
  }
  if (ok) favStore(a);
  favSel = {};
  sheetClose();
  if (view !== "fav") switchView("fav"); else renderList();
  toast("收藏了 " + ok + " 条" + (dup ? " · 已有 " + dup + " 条跳过" : "")
    + (empty ? " · " + empty + " 条没文字" : "") + (full ? " · 满了，后面的没收" : ""));
}
function favDelOne(idx) {
  var a = favAll(), i = parseInt(idx, 10);
  if (!(i >= 0 && i < a.length)) return;
  var f = a[i];
  a.splice(i, 1);
  favStore(a);
  renderList(); updNavCount();
  toast("已删除 1 条" + (f && f.who ? "（" + f.who + "）" : ""));
}
function updNavCount() {
  /* 收藏页签上那个数字（顶栏标题）跟着变 */
  if (view === "fav") { var pn = QI("pname"); if (pn) { pn.textContent = favAll().length + " 条收藏"; pn.title = pn.textContent; } }
}
/* ── 收藏：按角色分组（他 2026-11-13 要的「以角色排布」） ──────────────
   ★ 三条都是他定的，别改回去：
     ① 顶部不放标签筛选条 —— 他说「上面的全部伏笔名场面设定台词这些删了，只保留下面这个角色」
     ② **默认全部折叠**，第一次打开一个都不展开
     ③ 展开过哪几个记进本地存储（键 favopen），关掉酒馆再开还原；各记各的，能同时开多个
   ★ 分组键用 char（角色卡名）：一场聊天只有一个角色卡，同场聊天的收藏才不会散。
     取不到 char 才退到 who（说话人名），再取不到就叫「未记录角色」。
   ★ 展开先露 FAV_LIMIT 条，底下给「还有 N 条」——他选的（不是全铺）。 */
var FAV_LIMIT = 4;
var FAV_OPEN_K = "favopen";
var _favOpen = null;
function favOpenAll() {
  if (_favOpen) return _favOpen;
  var o = lsJSON(FAV_OPEN_K, null);
  _favOpen = (o && typeof o === "object" && !o.push) ? o : {};
  return _favOpen;
}
function favOpenOf(name) {
  var o = favOpenAll()[name];
  if (!o || typeof o !== "object") return { o: 0, f: 0 };
  return { o: o.o ? 1 : 0, f: o.f ? 1 : 0 };
}
function favOpenSet(name, st) {
  var all = favOpenAll();
  all[name] = { o: st.o ? 1 : 0, f: st.f ? 1 : 0 };
  try { lsSetJSON(FAV_OPEN_K, all); } catch (e) {}
}
/* 分组的块名：角色卡名优先。
   ★ 2026-11-13 补一条：早期版本因为取不到名字，把 who 写成了「消息」—— 那是兜底文案，
     不是名字。读到「消息」一律当空，退到「未记录角色」，别让块头挂个假名字。 */
function favGroupName(f) {
  var g = (f && f.char) ? String(f.char).trim() : "";
  if (!g && f && f.who) g = String(f.who).trim();
  if (g === "消息" || g === "User" || g === "用户") g = "";
  return g || "未记录角色";
}
/* 分组。块顺序按「这个角色最近存的那条」倒序 —— 刚收过谁，谁就在最上面。 */
function favGroupsOf(a) {
  var map = {}, names = [], i;
  a = a || [];
  for (i = 0; i < a.length; i++) {
    var nm = favGroupName(a[i]);
    if (!map[nm]) { map[nm] = { name: nm, rows: [] }; names.push(nm); }
    map[nm].rows.push({ f: a[i], i: i });
  }
  names.sort(function (x, y) {
    var ax = map[x].rows[0].f.at || 0, ay = map[y].rows[0].f.at || 0;
    if (ay !== ax) return ay - ax;
    return x < y ? -1 : 1;
  });
  var out = [];
  for (i = 0; i < names.length; i++) out.push(map[names[i]]);
  return out;
}
function favGroups() { return favGroupsOf(favAll()); }
/* 列表里那个时间：「今天 09:35 / 昨天 23:48 / 前天 19:20」，超过三天才写日期。
   ★ 写全日期他得自己在心里算，列表里要的是「多久以前存的」这个直觉。 */
function favDayTx(s) {
  var d = new Date(String(s == null ? "" : s).replace(" ", "T"));
  if (!d || isNaN(d.getTime())) return String(s || "").slice(0, 16);
  var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
  var hm = p2(d.getHours()) + ":" + p2(d.getMinutes());
  var now = new Date();
  var d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  var diff = Math.round((d0 - dd) / 86400000);
  if (diff === 0) return "今天 " + hm;
  if (diff === 1) return "昨天 " + hm;
  if (diff === 2) return "前天 " + hm;
  return p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + hm;
}
function favItemHTML(row) {
  var f = row.f;
  var named = !!(f.title && String(f.title).trim());
  var line = String(f.text || "").replace(/\s+/g, " ").trim();
  var tags = (f.tags && f.tags.length) ? f.tags : null;
  var h = '<div class="fvi" data-fvopen="' + row.i + '">'
    +   '<div class="fvit">'
    +     '<span class="fvin' + (named ? "" : " none") + '">'
    +       esc(named ? String(f.title).trim() : line.slice(0, 30)) + "</span>"
    +     '<span class="fvid">' + esc(favDayTx(f.t)) + "</span>"
    +   "</div>";
  if (named) h += '<div class="fvip">' + esc(line.slice(0, 40)) + "</div>";
  if (tags) {
    h += '<div class="fvitag">';
    for (var i = 0; i < tags.length; i++) h += '<span class="fvtag">' + esc(tags[i]) + "</span>";
    h += "</div>";
  }
  return h + "</div>";
}
function favGroupHTML(g, gi) {
  var st = favOpenOf(g.name);
  var show = st.f ? g.rows : g.rows.slice(0, FAV_LIMIT);
  var rest = g.rows.length - show.length;
  var h = '<div class="fvg' + (st.o ? " on" : "") + '" data-fvg="' + gi + '">'
    +   '<div class="fvgh" data-fvgh="' + gi + '">'
    +     '<span class="fvga">' + esc(String(g.name).slice(0, 1)) + "</span>"
    +     '<span class="fvgn">' + esc(g.name) + "</span>"
    +     '<span class="fvgc">' + g.rows.length + "</span>"
    +     '<svg class="fvgar" viewBox="0 0 16 16" fill="none" stroke="currentColor"'
    +       ' stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'
    +       '<path d="M6 3.5L10.5 8 6 12.5"/></svg>'
    +   "</div>"
    +   '<div class="fvgl">';
  for (var i = 0; i < show.length; i++) h += favItemHTML(show[i]);
  if (rest > 0) h += '<button class="fvmore" data-fvmore="' + gi + '">还有 ' + rest + " 条 ›</button>";
  h += "</div></div>";
  return h;
}
/* 收藏页签（面板第六页）：上面一排开关 / 导出，下面是角色块
   ★ 2026-11-13 他明确说「从聊天里挑这是什么意思啊，我点了那个收藏的图标，我就是收藏这一条而已」
     ——「从聊天里挑」这个按钮删掉了。点星就是收这一条，不需要第二个入口。
     收藏页面上**只留开关 + 导出 + 列表**，不再有任何需要解释的按钮；
     空列表时用一句话把「星在哪」讲清楚（以前那句还指着一个已经不存在的按钮）。 */
function renderFav() {
  var el = QI("list"); if (!el) return;
  var a = favAll();
  var h = '<div class="exwrap"><div class="exseg">'
    +   '<button class="exb' + (favCfg.on ? " on" : "") + '" data-favsw="1">'
    +     '<i class="dot"></i>' + (favCfg.on ? "消息上的星：开" : "消息上的星：关") + "</button>"
    +   '<button class="exb" data-favexp="1">导出 md</button>'
    + "</div></div>";
  if (!a.length) {
    h += '<div class="empty">还没有收藏。<br>'
      + "在聊天里点某条消息<b>右下角那颗星</b>，这一条就收进来了（再点一次取消）。</div>";
  } else {
    var gs = favGroups();
    h += '<div class="fvwrap">';
    for (var i = 0; i < gs.length; i++) h += favGroupHTML(gs[i], i);
    h += "</div>";
  }
  el.innerHTML = h;
}
/* 点块头：只切这一块的 class，不整页重画（重画会把滚动位置和正在进行的事抖一下） */
function favToggleGroup(gi) {
  var gs = favGroups(), g = gs[gi | 0];
  if (!g) return;
  var st = favOpenOf(g.name);
  st.o = st.o ? 0 : 1;
  favOpenSet(g.name, st);
  var box = QI("list") ? QI("list").querySelector('.fvg[data-fvg="' + (gi | 0) + '"]') : null;
  if (box) box.classList.toggle("on", !!st.o);
}
/* 「还有 N 条 ›」：把这一块换成全铺。只替换这一块，别的块不动。 */
function favMoreGroup(gi) {
  var gs = favGroups(), g = gs[gi | 0];
  if (!g) return;
  var st = favOpenOf(g.name);
  st.f = 1;
  favOpenSet(g.name, st);
  var box = QI("list") ? QI("list").querySelector('.fvg[data-fvg="' + (gi | 0) + '"]') : null;
  if (!box) { renderFav(); return; }
  var tmp = pdoc.createElement("div");
  tmp.innerHTML = favGroupHTML(g, gi | 0);
  var nu = tmp.firstChild;
  if (nu) box.parentNode.replaceChild(nu, box);
}
/* =====================================================================
   收藏 · 全屏阅读页（sheetShow("fr")）
     他要的是「收藏也要能查看」：列表里只露三行，点进去整条读完。
     外壳复用 #sheet（高度 visualViewport 实测，见 sheetFit），
     正文可选中复制，底下一行能翻上一条 / 下一条 / 删。
   ===================================================================== */
var favReadIdx = 0;
function sheetFavRead() {
  var a = favAll();
  if (!a.length) return "";
  if (favReadIdx > a.length - 1) favReadIdx = a.length - 1;
  if (favReadIdx < 0) favReadIdx = 0;
  var f = a[favReadIdx];
  var named = !!(f.title && String(f.title).trim());
  var src = [f.char, f.chat].filter(Boolean).join(" · ");
  var tags = (f.tags && f.tags.length) ? f.tags : [];
  var h = '<div class="frdw">'
    + '<div class="shd">'
    +   '<span class="back" data-shback="1" title="返回列表">' + SV.left + "</span>"
    +   '<span class="tit' + (named ? "" : " none") + '">'
    +     esc(named ? String(f.title).trim() : "（还没起名字）") + "</span>"
    +   '<span class="ok" data-fvren="1">改名</span>'
    +   '<span class="ok" data-frdcopy="1">复制</span>'
    + "</div>"
    + '<div class="frd">'
    +   '<div class="frdm">' + esc(f.who || "消息") + " · " + esc(favTimeTx(f.t))
    +     (src ? " · " + esc(src) : "") + "</div>"
    +   '<div class="frdt">' + esc(f.text) + "</div>"
    +   (f.cut ? '<div class="frdc">（这条太长，收藏时截断了一截）</div>' : "")
    + "</div>"
    + '<div class="fvrdt">';
  for (var i = 0; i < tags.length; i++) {
    h += '<span class="fvtag">' + esc(tags[i])
      +  '<i data-fvtagdel="' + escAttr(tags[i]) + '" title="去掉这个标签">×</i></span>';
  }
  h += '<button class="fvadd" data-fvtagadd="1">+ 标签</button></div>'
    + '<div class="frdb">'
    +   '<button class="btn" data-frdnav="-1"' + (favReadIdx <= 0 ? " disabled" : "") + ">‹ 上一条</button>"
    +   '<span class="frdn">' + (favReadIdx + 1) + " / " + a.length + "</span>"
    +   '<button class="btn" data-frdnav="1"' + (favReadIdx >= a.length - 1 ? " disabled" : "") + ">下一条 ›</button>"
    +   '<button class="btn" data-frddel="1">删除</button>'
    + "</div></div>";
  return h;
}
function favReadOpen(i) {
  favReadIdx = Math.max(0, i | 0);
  sheetShow("fr");
}
/* 读页里翻页 / 删：删除后如果没剩几条就自动退回列表 */
function favReadNav(d) {
  var a = favAll();
  var n = favReadIdx + d;
  if (n < 0 || n > a.length - 1) return;
  favReadIdx = n;
  var s = sheetEl(); if (s) s.innerHTML = sheetFavRead();
}
function favReadDel() {
  var a = favAll();
  if (!a.length) { sheetClose(); return; }
  if (favReadIdx > a.length - 1) favReadIdx = a.length - 1;
  /* ⚠ favDelOne 里已经 renderList + toast 了，这里只补「读页自己重画 / 空了就退出」，别再 toast 一遍 */
  var doDel = function () {
    favDelOne(String(favReadIdx));
    var b = favAll();
    if (!b.length) { sheetClose(); return; }
    if (favReadIdx > b.length - 1) favReadIdx = b.length - 1;
    var s = sheetEl(); if (s) s.innerHTML = sheetFavRead();
  };
  if (typeof dlgOpen === "function") {
    dlgOpen("删掉这条收藏？", "只删收藏夹里的这份，聊天记录不动。", "删掉", doDel);
  } else doDel();
}
/* 带输入框的确认弹窗（复用 dlg 的外壳，中间那块换成 input）。
   ★ 不用 pwin.prompt：安卓 WebView 里要么根本不弹，要么弹出来的框被键盘盖死 —— 踩过。
   ★ 值用闭包 cur 记着，不靠事后去 DOM 里读：dlg 关闭时可能已经重画过。 */
function askInput(title, val, ph, cb) {
  var cur = String(val == null ? "" : val);
  dlgOpen(title,
    '<input id="skAskIn" class="askin" maxlength="40" value="' + escAttr(cur)
    + '" placeholder="' + escAttr(ph || "") + '">',
    "确定", function () { cb(cur); });
  var e = QI("skAskIn");
  if (!e) return;
  e.addEventListener("input", function () { cur = e.value; });
  e.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      var y = QI("dlgYes"); if (y) y.click();
    }
  });
  setTimeout(function () { try { e.focus(); } catch (x) {} }, 80);
}
/* 改完名字 / 标签后要同时刷新「阅读页」和「列表」——
   列表里显示的就是名字，不刷新等于改了看不出效果。
   ⚠ renderFav 只能在收藏页签上调：别的页签时会把当前列表页冲掉。 */
function favReadRefresh() {
  var s = sheetEl();
  if (s) s.innerHTML = sheetFavRead();
  if (view === "fav") renderFav();
}
function favRename() {
  var a = favAll(), f = a[favReadIdx];
  if (!f) return;
  askInput("给这条收藏起个名字", f.title || "", "比如：她的第三封信", function (v) {
    f.title = String(v || "").trim().slice(0, 40);
    favStore(a);
    favReadRefresh();
    toast(f.title ? "名字改好了" : "名字清空了 · 改回显示正文开头");
  });
}
function favTagAdd() {
  var a = favAll(), f = a[favReadIdx];
  if (!f) return;
  askInput("加个标签", "", "比如：伏笔 / 名场面 / 台词", function (v) {
    var t = String(v || "").trim().slice(0, 12);
    if (!t) return;
    if (!f.tags || !f.tags.push) f.tags = [];
    if (f.tags.indexOf(t) >= 0) { toast("已经有这个标签了"); return; }
    if (f.tags.length >= 8) { toast("一条最多 8 个标签，够用了吧"); return; }
    f.tags.push(t);
    favStore(a);
    favReadRefresh();
    toast("加了标签「" + t + "」");
  });
}
function favTagDel(t) {
  var a = favAll(), f = a[favReadIdx];
  if (!f || !f.tags) return;
  var i = f.tags.indexOf(t);
  if (i < 0) return;
  f.tags.splice(i, 1);
  favStore(a);
  favReadRefresh();
}
/* =====================================================================
   关于 / 更新（面板第七页）
     ★ 他 2026-11-13 要的：「在一个地方加一个更新功能」。
       流程：拉仓库根目录的 update.json → 对比 manager.version → 拉 script/pm.js
       → 替换酒馆脚本库里【当前启用的那条】「预设管理器」的 content → 保存设置。
     ★★ 三条不能踩的线：
       ① 只能认 name 匹配 + enabled 的那一条。脚本库里有好几条同名旧条目
          （历史上重装留下的，都是 enabled=false），按 id 找会挑错。
       ② 写之前把旧 content 备份进 localStorage（sk_pm_bak），关于页给「回滚」。
       ③ 保存失败必须把内存改回去并明说 —— 不然界面显示「更新成功」，
          重开酒馆还是旧版，比报错更糟（＝「覆盖 ≠ 生效」，教训 #45）。
   ===================================================================== */
var PM_RAW = "https://raw.githubusercontent.com/zhaoyichan/SillyTavern-Preset-Stockholm/main";
/* ⚠ 这里只写键名本体，ls/lsSet 会自动加 PFX("sk_pm_") 前缀 ——
   写成 "sk_pm_bak" 实际落盘的是 "sk_pm_sk_pm_bak"，事后自己去 localStorage 翻会找不到。 */
var PM_BAK = "bak";
var updSt = { st: "idle", ver: "", file: "script/pm.js", chg: [], err: "", msg: "", busy: false };
function vcmp(a, b) {
  var pa = String(a || "").replace(/^v/i, "").split("."), pb = String(b || "").replace(/^v/i, "").split(".");
  var n = Math.max(pa.length, pb.length);
  for (var i = 0; i < n; i++) {
    var x = parseInt(pa[i] || "0", 10) || 0, y = parseInt(pb[i] || "0", 10) || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
function updFetch(url, cb) {
  var W = vpWin(), done = false;
  var fin = function (ok, txt, err) { if (done) return; done = true; cb(ok, txt, err); };
  try {
    if (!W.fetch) { fin(false, "", "这个环境没有 fetch"); return; }
    /* ★ 必须带 no-store + 时间戳：手机浏览器 / WebView 会把 update.json 缓存住，
       他都发新版了这边还显示旧的，看着就像「更新功能坏了」。 */
    W.fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "_t=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (t) { fin(true, t, ""); })
      .catch(function (e) { fin(false, "", (e && e.message) || String(e)); });
  } catch (e2) { fin(false, "", (e2 && e2.message) || String(e2)); }
  /* 超时兜底：手机上被墙时 fetch 会挂很久，不能让他盯着「检查中」不动 */
  setTimeout(function () { if (!done) fin(false, "", "超时（20 秒没响应，可能被墙）"); }, 20000);
}
/* 找到脚本库里当前生效的那条「预设管理器」。返回 {e,ctx} 或 {err} */
function pmEntry() {
  try {
    var c = null;
    if (pwin.SillyTavern && typeof pwin.SillyTavern.getContext === "function") c = pwin.SillyTavern.getContext();
    var th = c && c.extensionSettings && c.extensionSettings.tavern_helper;
    var arr = th && th.script && th.script.scripts;
    if (!arr || !arr.length) return { err: "读不到脚本库（酒馆助手的设置结构变了？）" };
    var i, pick = -1;
    for (i = 0; i < arr.length; i++) if (arr[i] && arr[i].name === APP && arr[i].enabled) { pick = i; break; }
    if (pick < 0) for (i = 0; i < arr.length; i++) if (arr[i] && arr[i].name === APP) pick = i;
    if (pick < 0) return { err: "脚本库里没有「" + APP + "」这一条" };
    return { e: arr[pick], ctx: c, n: arr.length };
  } catch (e) { return { err: "读脚本库出错：" + ((e && e.message) || e) }; }
}
/* ── 写回脚本库：必须走酒馆助手自己的 store（v2.0，最要命的一次修复）───────
   ★★★ 他 2026-11-13 报：「能更新啊，但更新完我重启酒馆还是原来那个样子」。
   真因（翻 JS-Slash-Runner 源码 src/store/settings/global.ts 逐行确认）：
     酒馆助手 4.x 把全局脚本搬进了 pinia store ——
       const settings = ref(getSettings());      // zod parse = 深拷贝出来的副本
       watch(settings, s => { _.set(extension_settings,'tavern_helper',klona(s));
                              saveSettingsDebounced(); }, {deep:true});
     【真正在跑、真正会被存盘的是 store 里那份副本】，
     而 SillyTavern.getContext().extensionSettings.tavern_helper.script.scripts
     只是它的投影。我们以前直接改投影里那条的 content，于是：
       ① 正在跑的 iframe 不会变；
       ② store 只要有任何一次变化（开关一个脚本、改个设置），deep watch 就把
          旧副本 _.set 回去，把我们写的冲掉；
       ③ 最终存盘的还是旧内容 —— 重启当然「还是原来那个样子」。
   ★ 正确路径 = 酒馆助手暴露的 updateScriptTreesWith(fn, {type})：
     它改的就是那个 store，watch 顺手把 extension_settings 和磁盘一起写对。
     状态球（另一个酒馆助手脚本）一直这么更新 —— 他让我「看看别人的」就是指这个。
   ★ 写完必须读回来校验（getScriptTrees）：拿不到新版就报失败，不许报成功（教训 #45）。
   ★ 两份都写：type:"global" 是全局脚本库那条；type:"preset" 是预设里注入的那份
     （预设内嵌的脚本会在切换预设时生效，只写 global 会出现「换个预设又变回旧版」）。 */
function pmApi(name) {
  var cands = [];
  try { cands.push(pwin); } catch (e0) {}
  try { cands.push(pwin.TavernHelper); } catch (e1) {}
  try { cands.push(pwin.SillyTavern); } catch (e2) {}
  try { cands.push(window); } catch (e3) {}
  for (var i = 0; i < cands.length; i++) {
    try {
      var o = cands[i];
      if (o && typeof o[name] === "function") return { fn: o[name], owner: o };
    } catch (e4) {}
  }
  return null;
}
/* 在一棵脚本树里找「该改的那一条」：
   先按 id（精确，不会误伤脚本库里 4 条同名历史条目），再按 name+enabled，最后按 name。 */
function pmTreePick(trees, id) {
  var all = [], i, j;
  for (i = 0; i < (trees || []).length; i++) {
    var t = trees[i]; if (!t) continue;
    if (t.type === "folder") {
      for (j = 0; j < (t.scripts || []).length; j++) if (t.scripts[j]) all.push(t.scripts[j]);
    } else all.push(t);
  }
  if (id) for (i = 0; i < all.length; i++) if (all[i].id === id && all[i].name === APP) return all[i];
  for (i = 0; i < all.length; i++) if (all[i].name === APP && all[i].enabled) return all[i];
  for (i = 0; i < all.length; i++) if (all[i].name === APP) return all[i];
  return null;
}
/* 返回 {ok, msg}。cb 一定被调一次。 */
function pmWriteScript(code, ver, cb) {
  var g = pmEntry();
  var id = (g && g.e && g.e.id) || "";
  var oldInfo = String((g && g.e && g.e.info) || "");
  /* ⚠ 这里必须 new RegExp：直接把 "\\s*" 当字符串传给 replace 会被当成字面量，
     一个都匹配不到（info 里永远留着旧版本号，他就以为没更新）。 */
  var newInfo = oldInfo.indexOf(APP + " v") >= 0
    ? oldInfo.replace(new RegExp(APP + "\\s*v[\\d.]+"), APP + " " + (ver || ""))
    : (APP + " " + (ver || "") + (oldInfo ? "：" + oldInfo : ""));
  var upd = pmApi("updateScriptTreesWith"), get = pmApi("getScriptTrees");
  var hit = 0, errs = [], types = [];

  if (upd) {
    ["global", "preset"].forEach(function (type) {
      try {
        var got = false;
        upd.fn.call(upd.owner, function (trees) {
          var t = pmTreePick(trees, id);
          if (t) { t.content = code; if (newInfo) t.info = newInfo; got = true; }
          return trees;
        }, { type: type });
        if (got) { hit++; types.push(type === "global" ? "全局" : "预设"); }
      } catch (e) { errs.push(type + "：" + ((e && e.message) || e)); }
    });
  }
  /* 读回校验：store 里必须真的是新内容才算成功 */
  var why = "";
  if (get) {
    try {
      var trees = get.fn.call(get.owner, { type: "global" });
      var t2 = pmTreePick(trees, id);
      if (!t2) why = "写完之后读回来找不到这一条";
      else {
        var txt = String(t2.content || "");
        var okLen = Math.abs(txt.length - code.length) <= 2;
        var okVer = !ver || txt.indexOf('VER = "' + ver + '"') >= 0;
        if (!okLen || !okVer) why = "读回来还是旧内容（" + txt.length + " 字符，应为 " + code.length + "）";
      }
    } catch (e5) { why = "校验出错：" + ((e5 && e5.message) || e5); }
  }

  if (!why && hit) {
    cb(true, "已写入" + (types.length ? "（" + types.join(" + ") + "）" : "") + "，重开酒馆生效");
    return;
  }
  /* API 走不通 → 退回老写法（老版酒馆助手没这个 API）。能不能生效就听天了，但至少不留假成功 */
  if (!hit) {
    try {
      if (g && g.e) {
        g.e.content = code;
        if (newInfo) g.e.info = newInfo;
        var saved = false;
        try { if (g.ctx && typeof g.ctx.saveSettingsDebounced === "function") { g.ctx.saveSettingsDebounced(); saved = true; } } catch (e6) {}
        if (!saved) { try { if (typeof pwin.saveSettingsDebounced === "function") { pwin.saveSettingsDebounced(); saved = true; } } catch (e7) {} }
        if (!saved) { cb(false, "下载好了，但存不进酒馆设置 —— 去电脑上用导入件更新"); return; }
        cb(true, "已写入（兼容写法：你的酒馆助手版本较老，没有 updateScriptTreesWith）");
        return;
      }
    } catch (e8) { errs.push("兼容写法：" + ((e8 && e8.message) || e8)); }
  }
  cb(false, why || ("写不进脚本库" + (errs.length ? "：" + errs[0] : "")));
}

function updCheck(cb) {
  if (updSt.busy) return;
  updSt = { st: "checking", ver: "", file: "script/pm.js", chg: [], err: "", msg: "", busy: true };
  renderList();
  updFetch(PM_RAW + "/update.json", function (ok, txt, err) {
    updSt.busy = false;
    if (!ok) {
      updSt.st = "fail"; updSt.err = err || "拉不到";
      renderList(); if (cb) cb(false); return;
    }
    var mf = null;
    try { mf = JSON.parse(txt); } catch (e) { mf = null; }
    if (!mf || !mf.manager) {
      updSt.st = "fail"; updSt.err = "update.json 里没有 manager 段（拿到的大概是 404 网页）";
      renderList(); if (cb) cb(false); return;
    }
    updSt.ver = String(mf.manager.version || "");
    updSt.file = String(mf.manager.file || "script/pm.js");
    updSt.chg = (mf.manager.changelog || []).slice(0, 30);
    updSt.st = vcmp(updSt.ver, VER) > 0 ? "new" : "same";
    renderList(); if (cb) cb(true);
  });
}
/* ★ 允许 "same" 也走安装：发版时「内容改了但忘了升版本号」很常见（教训 #26 / #45），
   那种情况下版本比对永远说「已是最新」，他就再也拿不到新内容 ——
   所以同版本也要能把线上那份重新拉下来覆盖。 */
function updInstall() {
  if (updSt.busy || (updSt.st !== "new" && updSt.st !== "same")) return;
  var g = pmEntry();
  if (g.err) { toast(g.err + " —— 只能手动导入"); return; }
  var src = PM_RAW + "/" + (updSt.file || "script/pm.js");
  updSt.busy = true; updSt.st = "loading"; renderList();
  updFetch(src, function (ok, code, err) {
    updSt.busy = false;
    if (!ok || !code || code.length < 5000) {
      updSt.st = "fail"; updSt.err = err || "下下来的脚本不完整";
      renderList(); return;
    }
    /* ★ 先备份当前内容（回滚用）。备份从脚本库取，不从 store 取 —— 两边内容一样，
       但 store 那份可能还没同步，脚本库这条才是他正在跑的那份。 */
    var oldC = String(g.e.content || "");
    try { lsSet(PM_BAK, JSON.stringify({ v: VER, c: oldC, t: Date.now() })); } catch (eB) {}
    /* ★★ 写回必须走酒馆助手的 store（见 pmWriteScript 上面那段长注释）——
       以前直接改 extensionSettings 里那条，会被 store 的 deep watch 覆盖回去，
       于是「提示更新成功、重启还是旧版」。 */
    pmWriteScript(code, updSt.ver, function (ok, msg) {
      updSt.st = ok ? "done" : "fail";
      updSt.err = ok ? "" : (msg || "写入失败");
      updSt.msg = ok ? (msg || "") : "";
      renderList();
      if (ok) toast("已更新到 " + updSt.ver + " —— " + (msg || "重开酒馆生效"));
    });
  });
}
/* 回滚：只有备份的版本跟当前版本不一样时才给这个按钮 */
function updBak() {
  try {
    var b = JSON.parse(ls(PM_BAK, "") || "null");
    return (b && b.c && b.v && b.v !== VER) ? b : null;
  } catch (e) { return null; }
}
function updRollback() {
  var b = updBak(); if (!b) { toast("没有可回滚的版本"); return; }
  /* ★ 回滚跟更新走同一条写入路径 —— 以前回滚也是直接改 extensionSettings，
       同一个坑：提示成功、重开还是新版。 */
  pmWriteScript(String(b.c || ""), b.v, function (ok, msg) {
    if (!ok) { toast("回滚失败：" + (msg || "写不进脚本库")); return; }
    try { lsSet(PM_BAK, ""); } catch (e2) {}
    updSt = { st: "idle", ver: "", file: "script/pm.js", chg: [], err: "", msg: "", busy: false };
    renderList(); toast("已回滚到 " + b.v + " —— 重开酒馆生效");
  });
}
function renderAbout() {
  var el = QI("list"); if (!el) return;
  var st = updSt, bak = updBak();
  var line = "";
  if (st.st === "checking") line = '<div class="abst">正在查线上版本…</div>';
  else if (st.st === "loading") line = '<div class="abst">正在下载脚本…（有 300 多 KB，稍等）</div>';
  else if (st.st === "fail") line = '<div class="abst bad">' + esc(st.err || "检查失败") + "</div>";
  else if (st.st === "same") line = '<div class="abst">已是最新（线上 ' + esc(st.ver) + "）"
    + " · 想强制重下就点「重新覆盖」</div>";
  else if (st.st === "new") line = '<div class="abst">线上有新版 <b>' + esc(st.ver) + "</b>，更新后重开酒馆生效。</div>";
  else if (st.st === "done") line = '<div class="abst">已写入 <b>' + esc(st.ver || "") + "</b>"
    + (st.msg ? "（" + esc(st.msg) + "）" : "") + " —— <b>把酒馆完全关掉再开</b>才生效（脚本要重新加载）。</div>";
  else line = '<div class="abst">连的是仓库的 update.json 和 script/pm.js。</div>';

  var h = '<div class="exwrap">'
    + '<div class="exlb1">版本</div>'
    + '<div class="abver">' + esc(APP) + " " + esc(VER) + "<i>脚本 · 独立于预设</i></div>"
    + '<div class="exseg" style="margin-top:8px">'
    +   '<button class="exb" data-updcheck="1">' + (st.busy ? "检查中…" : "检查更新") + "</button>"
    +   (st.st === "new" ? '<button class="exb on" data-updgo="1">立即更新到 ' + esc(st.ver) + "</button>" : "")
    +   (st.st === "same" ? '<button class="exb" data-updgo="1">重新覆盖</button>' : "")
    +   (bak ? '<button class="exb" data-updbak="1">回滚到 ' + esc(bak.v) + "</button>" : "")
    + "</div>"
    + line;
  if (st.chg && st.chg.length) {
    h += '<div class="exlb1">更新日志</div><div class="ablog">';
    for (var i = 0; i < st.chg.length; i++) {
      var t = String(st.chg[i] || "");
      var cls = /^——/.test(t) ? "d" : (/^★/.test(t) ? "k" : "");
      h += '<div' + (cls ? ' class="' + cls + '"' : "") + ">" + esc(t) + "</div>";
    }
    h += "</div>";
  }
  h += "</div>";
  el.innerHTML = h;
}
/* 截图设置页（面板第五个页签）
   ★ 排版跟「导出」页签走同一套组件（.exwrap / .exlb1 / .exseg / .exb / .exhint），
     别自己造一排样式 —— 五个页签要像同一个面板里的五页，不是五个插件拼起来的。 */
function renderShot() {
  var el = QI("list"); if (!el) return;
  var c = shotCfg;
  var thms = [["", "原样"], ["card", "卡片"], ["paper", "信纸"], ["night", "夜读"]];
  var segb = function (attr, on, txt) {
    return '<button class="exb' + (on ? " on" : "") + '" ' + attr + '><i class="dot"></i>' + txt + "</button>";
  };
  var logs = shotLogs();
  el.innerHTML = '<div class="exwrap">'
    + '<div class="exlb1">怎么用</div>'
    + '<div class="exhint">每条消息<b>右侧竖着两个</b>小图标：上面<b>相机</b>把<b>这一条</b>对话存成图片，'
    +   '下面<b>方块</b>复制这条消息的文字（竖排是为了不跟下面那排「继续 / 下一页生成」挨在一起，'
    +   '免得点复制点错触发生成）。<br>只截你点的那一条，不会把整个聊天都截进去。</div>'
    + '<div class="exlb1">图片存到哪</div>'
    + '<div class="exhint">进手机「下载」文件夹。<b>不写酒馆自己的目录（data 那些）、不留临时文件</b>，'
    +   '全程在内存里，截完就释放。</div>'
    + '<div class="exlb1">开关</div>'
    + '<div class="exseg">' + segb('data-shotsw="1"', c.on, c.on ? "已开启" : "已停用") + "</div>"
    + '<div class="exlb1">清晰度 · 越高越清晰，文件也越大</div>'
    + '<div class="exhint" style="margin-top:-2px">太长的消息会按手机能扛的上限<b>自动降一点</b>，'
    +   '存图时会告诉你降到了多少 —— 不然手机直接卡死。</div>'
    + '<div class="exrow sliderow">'
    +   '<input type="range" class="sld" id="shotDpi" min="1" max="4" step="0.5" value="' + c.dpi + '">'
    +   '<span class="sv" id="shotDpiV">' + c.dpi.toFixed(1) + "×</span>"
    + "</div>"
    + '<div class="exlb1">格式</div>'
    + '<div class="exseg">'
    +   segb('data-shotfmt="png"', c.fmt === "png", "PNG 无损")
    +   segb('data-shotfmt="jpg"', c.fmt === "jpg", "JPG 更小")
    + "</div>"
    + '<div class="exlb1">底色 · 默认日间白底（跟下面那排美化一样，点一下就换）</div>'
    + '<div class="exseg">'
    +   segb('data-shotbg="day"', c.bg === "day", "日间 · 白底")
    +   segb('data-shotbg="night"', c.bg === "night", "夜间 · 黑底")
    + "</div>"
    + '<div class="exlb1">HTML 美化 · 聊天气泡当场换装，截下来就是看到的</div>'
    + '<div class="exseg">' + thms.map(function (t) {
        return segb('data-shotthm="' + t[0] + '"', c.thm === t[0], t[1]);
      }).join("") + "</div>"
    + '<div class="exlb1">出图记录 · 存不下来就复制这段发给我</div>'
    + '<div class="exhint" style="margin-top:-2px">每一次截图（成功 / 降级 / 失败）都记一行，'
    +   '最近 ' + Math.min(5, logs.length) + " 条在这儿，最多留 " + SHOT_LOGN + " 条。"
    +   '存不进去、或者冒出看不懂的报错时，点「复制日志」整段发给我 —— 里面连手机环境都带着，'
    +   '比我在这儿猜快得多。</div>'
    + '<div class="sklog">'
    +   (logs.length ? logs.slice(0, 5).map(function (s) {
          return '<div class="sklogrow">' + esc(s) + "</div>";
        }).join("") : '<div class="sklogrow dim">（还没有出过图）</div>')
    + "</div>"
    + '<div class="exseg">'
    +   '<button class="exb" data-shotlogcopy="1"><i class="dot"></i>复制日志</button>'
    +   '<button class="exb" data-shotlogclr="1"><i class="dot"></i>清空</button>'
    + "</div>"
    + "</div>";
}

/* =====================================================================
   心跳：① 把跑丢的球拽回来 ② 你在酒馆里换了预设 → 这边自动跟着换
   ===================================================================== */
var lastFp = "";
function tick() {
  orbClamp();
  /* 启动时哪一步没跑通 → 心跳里自己补跑几次（最多 3 次，别没完没了地试） */
  if (!bootOK && bootFixN < 3) { bootFixN++; bootResume(); }
  /* 截图 / 复制图标：放在 apiReady 闸门【之前】—— 补图标只是往气泡里挂两个键，
     不依赖酒馆接口，没道理因为接口还没好就跟着一起停摆。 */
  if (shotCfg.on) { try { shotTick(); } catch (eShot) { errSave(ownErr(eShot)); } }
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
    /* ★★ 11-04：默认一律正中间，只有【用户亲手拖过】才恢复记忆位置。
       旧版一启动就把算出来的坐标写进 pos（还会左右贴边吸附），之后每次都恢复它 ——
       他曾在贴边 / 小窗口下开过一次，球就被永久钉在那个坐标，小窗里根本找不着。
       老版本没写过 posuser → 这次更新自然全部归位正中间，正是他要的。 */
    var userPos = orbUserPos();
    var pos = String(ls("pos", "") || "").split(",");
    var placed = false;
    if (userPos && pos.length === 2) {
      var x = parseFloat(pos[0]), y = parseFloat(pos[1]);
      if (isFinite(x) && isFinite(y)) { orbPlace(orbEl, x, y, ls("edge", "")); placed = true; }
    }
    if (!placed) orbCenter(orbEl);
    orbClamp();
  } catch (e) { errSave(ownErr(e)); }
  dragBind(orbEl, orbEl, {
    click: onOrbClick,
    longPress: function () { diagOpen(); },
    after: function () {
      /* ★ 只有球真的被拖动过才打这个标记 —— after 只在「移动超过 4px 且松手」时触发，
         单击 / 长按都不算。⚠ 不能写进通用 dragBind：面板拖动也走那个函数，
         会把「拖面板」误记成「拖过球」。 */
      lsSet("posuser", "1");
      try { if (panelOpen) placePanel(); } catch (e2) { errSave(ownErr(e2)); }
    }
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
  bootStepRun("键盘高度", function () { kbWatch(); });
  bootStepRun("心跳", function () { vpWatch(); setInterval(tick, 2500); });
  if (!ls("tipped", "")) {
    lsSet("tipped", "1");
    setTimeout(function () { toast("点屏幕正中间的球打开预设管理器（拖动能换位置，会记住）"); }, 700);
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
  QI("finp").addEventListener("input", function (e) { findSet(e.target.value); autogrow(e.target, 56); });
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
    /* ★ 收藏的勾选页也共用这两个按钮：返回＝放弃勾选，完成＝收藏选中的 */
    if ((h = hit("data-shback"))) {
      if (edWhich === "f") { favSel = {}; sheetClose(); renderList(); return; }
      if (edWhich === "fr") { sheetClose(); renderList(); return; }   /* 收藏阅读页：返回列表 */
      finishEdit(); return;
    }
    if ((h = hit("data-shok"))) {
      if (edWhich === "f") { favBulkAdd(); return; }
      finishEdit(); toast("已保存"); return;
    }
    /* 编辑页查找条 —— 全部走 data-fact，别用 id 判（重渲染后 id 一样但节点换了） */
    if ((h = hit("data-fact"))) {
      var fk = h.getAttribute("data-fact");
      if (fk === "open") { fBar.on = true; sheetRender(); fBoot("edit"); return; }
      if (fk === "close") { fBar.on = false; sheetRender(); fRecalc(0, true); return; }
      if (fk === "prev") { fJump(-1); return; }
      if (fk === "next") { fJump(1); return; }
      if (fk === "rep") { fReplaceOne(); return; }
      if (fk === "repall") { fReplaceAll(); return; }
      if (fk === "undo") { fUndoDo(); return; }
    }
    /* 查看态点正文 → 切编辑态（滚动位置带过去，光标落在当前命中处，键盘起来） */
    /* 快捷输入行：「复制 · 条目内容」 */
    if ((h = hit("data-pcopy"))) { pCopyBody(); return; }
    /* 列表底部：整体替换 / 撤销 */
    if ((h = hit("data-pbulk"))) { pBulkOpen(); return; }
    if ((h = hit("data-pundo"))) { pUndoDo(); return; }
    if ((h = hit("data-errcopy"))) { errCopy(); return; }
    /* 底栏「名字 · 角色」收/展（v2.5）—— 收起时正文框一直吃到键盘上沿，
       展开时把正文框挤小一点。切完必须重算框高，否则那块空白又回来了。
       ⚠ 展开时【不许 focus 任何输入框】：一 focus 键盘就弹，整页重排＝卡（老坑）。 */
    if ((h = hit("data-ftg"))) {
      var fbox = h.closest(".sft");
      if (fbox) {
        var fFold = fbox.classList.contains("fold");
        if (fFold) {
          /* 要收起：先把输入框里的当前值抄到摘要条上（不然改了名字还显示旧的） */
          var fnm = fbox.querySelector("[data-nm]"), frl = fbox.querySelector("[data-role]");
          var fv1 = fbox.querySelector(".ftv"), fv2 = fbox.querySelector(".ftw");
          if (fnm && fv1) fv1.textContent = fnm.value || "（未命名）";
          if (frl && fv2) fv2.textContent = frl.value || "system";
          fbox.classList.remove("fold");
        } else {
          fbox.classList.add("fold");
        }
        sftOpen = fFold;                 /* 记在外面：整页重画后还保持这个状态 */
        var flab = fbox.querySelector(".ftx");
        if (flab) flab.textContent = fFold ? "收起" : "展开";
        fitTa();
      }
      return;
    }
    /* 顺序自检条（v2.4）：一键按上次正常顺序还原 / 先不管 */
    if ((h = hit("data-ordfix"))) { ordFixRun(); return; }
    if ((h = hit("data-ordx"))) { ordWarn = null; renderList(); return; }
    /* 截图设置页：开关 / 格式 / 底色 / 美化主题（清晰度滑条走 input 委托） */
    if ((h = hit("data-shotsw"))) { shotCfg.on = !shotCfg.on; shotSave(); shotApply(); renderList(); toast(shotCfg.on ? "消息截图已开启" : "消息截图已停用"); return; }
    if ((h = hit("data-shotfmt"))) { shotCfg.fmt = h.getAttribute("data-shotfmt"); shotSave(); renderList(); return; }
    if ((h = hit("data-shotbg"))) {
      shotCfg.bg = (h.getAttribute("data-shotbg") === "night") ? "night" : "day";
      shotSave(); shotApply(); renderList();
      toast(shotCfg.bg === "night" ? "已切夜间黑底" : "已切日间白底"); return;
    }
    if ((h = hit("data-shotthm"))) {
      shotCfg.thm = h.getAttribute("data-shotthm"); shotSave(); shotApply(); renderList();
      toast(shotCfg.thm ? "美化已换——现在聊天的样子就是截下来的样子" : "已恢复原样"); return;
    }
    /* 出图记录：失败时他要能把报错发给我，所以整段（含环境）一次复制走 */
    if ((h = hit("data-shotlogcopy"))) { copyTextTo(shotLogText(), "日志已复制 —— 直接发给 AI 就行"); return; }
    if ((h = hit("data-shotlogclr"))) {
      try { lsSet(SHOT_LOGK, ""); } catch (eCLR) {}
      renderList(); toast("出图记录已清空"); return;
    }
    /* 跨书搜出来的结果：整行都是「进那本书并定位」 */
    if ((h = hit("data-hit"))) { wbHitGo(h.getAttribute("data-hit")); return; }
    /* 收藏页：开关 / 挑几条 / 导出 / 删一条 / 展开全文（删按钮在行里，必须排在展开前面） */
    if ((h = hit("data-favsw"))) {
      favCfg.on = !favCfg.on; favSaveCfg(); shotApply(); renderList();
      toast(favCfg.on ? "收藏图标已打开" : "收藏图标已关掉");
      return;
    }
    /* ★ 2026-11-13：「从聊天里挑」入口按他要求删了（点星就够了）。favPickOpen /
       sheetFavSel / favBulkAdd 这套还在下面留着 —— 以后他要批量收，把按钮加回来就行。 */
    if ((h = hit("data-favexp"))) { favExport(); return; }
    /* 角色块折叠 / 「还有 N 条」/ 改名 / 加标签 —— 必须排在「点条目进阅读页」前面，
       否则点在块头或按钮上会被当成点了条目（块头包着整个块）。 */
    if ((h = hit("data-fvgh"))) { favToggleGroup(parseInt(h.getAttribute("data-fvgh"), 10) || 0); return; }
    if ((h = hit("data-fvmore"))) { favMoreGroup(parseInt(h.getAttribute("data-fvmore"), 10) || 0); return; }
    if ((h = hit("data-fvren"))) { favRename(); return; }
    if ((h = hit("data-fvtagadd"))) { favTagAdd(); return; }
    if ((h = hit("data-fvtagdel"))) { favTagDel(h.getAttribute("data-fvtagdel")); return; }
    if ((h = hit("data-fvdel"))) { favDelOne(h.getAttribute("data-fvdel")); return; }
    /* 点一行 = 进全屏阅读页（以前是就地展开三行，他说「收藏也要能查看」） */
    if ((h = hit("data-fvopen"))) { favReadOpen(h.getAttribute("data-fvopen")); return; }
    if ((h = hit("data-frdcopy"))) {
      var ra = favAll(), rf = ra[favReadIdx];
      if (rf) copyTextTo(rf.text, "已复制这条收藏");
      return;
    }
    if ((h = hit("data-frdnav"))) { favReadNav(parseInt(h.getAttribute("data-frdnav"), 10) || 0); return; }
    if ((h = hit("data-frddel"))) { favReadDel(); return; }
    /* 关于 / 更新页：检查 → 立即更新 → 回滚（回滚要确认，别手滑点掉新版） */
    if ((h = hit("data-updcheck"))) { updCheck(); return; }
    if ((h = hit("data-updgo"))) { updInstall(); return; }
    if ((h = hit("data-updbak"))) {
      dlgOpen("回滚到上一个版本？", "会把脚本库里的管理器换回上一版，重开酒馆生效。", "回滚", updRollback);
      return;
    }
    if ((h = hit("data-fvsel"))) {
      var fvk = h.getAttribute("data-fvsel");
      favSel[fvk] = !favSel[fvk];
      favSelSync();
      return;
    }
    if ((h = hit("data-fvok"))) { favBulkAdd(); return; }
    /* 世界书两级：进书 / 返回分类 —— 书行上同时还有 pin、整本开关，所以先断定进书签 */
    if ((h = hit("data-bopen"))) { wbOpenBook(h.getAttribute("data-bopen")); return; }
    if ((h = hit("data-bclose"))) { wbBack(); return; }
    if ((h = hit("data-pin"))) { wbPin(h.getAttribute("data-pin")); return; }
    if ((h = hit("data-grpadd"))) { wbGroupAdd(); return; }
    if ((h = hit("data-grpdel"))) { wbGroupDel(h.getAttribute("data-grpdel")); return; }
    /* 世界书新建：一级建书 / 书里建条目
       ⚠ 排在 data-bdel 前面也没关系，属性不同互不干扰；但必须在 data-grpsel 之前 */
    if ((h = hit("data-wbnew"))) { wbNewBook(); return; }
    if ((h = hit("data-wentadd"))) { wbAddEntry(); return; }
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
  /* 收录弹框里的按钮 + 切换预设列表 + 整体替换的分类（弹框不在 panel 里，得单独委托） */
  QI("dlgM").addEventListener("click", function (e) {
    var t = e.target && e.target.closest
      ? e.target.closest("[data-pginto],[data-pgnewok],[data-preset],[data-bw],[data-bk]") : null;
    if (!t) return;
    if (t.hasAttribute("data-bw")) { bulkW = t.getAttribute("data-bw"); pBulkTip(); return; }
    if (t.hasAttribute("data-bk")) { bulkK = t.getAttribute("data-bk"); pBulkTip(); return; }
    if (t.hasAttribute("data-preset")) { dlgClose(); presetSwitch(t.getAttribute("data-preset")); return; }
    if (t.hasAttribute("data-pginto")) { dlgClose(); pgDoInto(t.getAttribute("data-pginto")); return; }
    var inp = QI("pgnewnm");
    var nm = inp ? inp.value.trim() : "";
    if (!nm) { toast("先写个组名"); if (inp) inp.focus(); return; }
    dlgClose(); pgDoInto("__new__", nm);
  });
  /* 整体替换弹窗里的「查找」框：跟手长高 + 换词当场重算几条几处 */
  QI("dlgM").addEventListener("input", function (e) {
    if (e.target && e.target.id === "bkOld") { autogrow(e.target, 64); pBulkTip(); }
  });
  /* ★ 打字时的重活（token 计数 / 全文查找）一律延迟到停手后：
     每敲一个键就跑一遍全文，几万字的条目在手机上必卡（2026-11-13 他和查看态一起骂的就是这个）*/
  var ftTimers = {};
  function fTypeLater(k, fn, ms) {
    clearTimeout(ftTimers[k]);
    ftTimers[k] = setTimeout(fn, ms || 250);
  }
  var onInputCommon = function (e) {
    var t = e.target; if (!t || !t.getAttribute) return;
    var id, cnt, sc;
    /* 截图清晰度滑条：改完存起来，图标上立刻按新清晰度截 */
    if (t.id === "shotDpi") {
      shotCfg.dpi = Math.min(4, Math.max(1, parseFloat(t.value) || 3));
      var sv = QI("shotDpiV"); if (sv) sv.textContent = shotCfg.dpi.toFixed(1) + "×";
      shotSave(); return;
    }
    /* 编辑页查找 / 替换框：跟着长高，并且边打边重算命中 */
    if (t.id === "fq") {
      fBar.q = t.value; autogrow(t, 52);
      fTypeLater("fq", function () { fRecalc(0); }, 220);
      return;
    }
    if (t.id === "fr") { fBar.r = t.value; autogrow(t, 52); return; }
    if ((id = t.getAttribute("data-ta"))) {
      sc = edScope(id); if (!sc) return;
      cnt = sc.querySelector('[data-cnt="' + id + '"]');
      /* token 计数防抖：整段重算，不是每次按键都干 */
      if (cnt) {
        (function (el, tx) {
          fTypeLater("tok" + id, function () { el.textContent = fmt(tokOf(tx)) + " tok"; }, 320);
        })(cnt, String(t.value));
      }
      if (draft) draft.content = t.value; else if (editingId) harvestDraft(true);
      autoSave();                                     /* 停下打字就写回去 */
      /* 预设编辑页开着查找条：只刷计数 / mini 那行字，别把滚动位置拽走 */
      if (edWhich === "p" && editingId === id && fBar.on) {
        fTypeLater("frc" + id, function () { if (fBar.on) fRecalc(fBar.hi, true); }, 260);
      }
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
  /* 消息截图：只在真酒馆里挂（有 SillyTavern 才动主文档；预览页/测试不碰） */
  bootStepRun("消息截图", function () {
    if (!pwin || !pwin.SillyTavern) return;
    shotApply();
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
