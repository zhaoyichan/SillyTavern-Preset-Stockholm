# 开发者 / AI 完全手册

> 这份文件是给**要动手改这个仓库的 AI（DeepSeek / GPT / Claude / 你自己的下一个会话）**和作者本人看的。
> 目标：看完这一份，就能独立完成「改预设 → 定版本号 → 上传 → 用户能更新到」整条链路，不需要再问人。
>
> 最后更新：2026-10-10（脚本 v1.1 / 预设 v2.0）

---

## 0. 先搞清三件事（30 秒）

1. 这个仓库发**两样东西**，它们的版本号是分开的：
   - **预设**（`preset/preset-vX.Y.json`）：67 条提示词条目，2.5 万字，是作品的本体。
   - **脚本**（`script/orb.js`）：酒馆里的「斯德哥尔摩 · 状态球」悬浮球，负责读 `<state>`、开关条目、在线更新。
2. 用户拿更新的唯一入口是**仓库根的 `update.json`**。它像一张菜单，写清楚每条通道的版本、文件在哪、这次改了啥。
   菜单里没写的通道，用户面板上那条就会**灰掉显示「未提供」**。
3. **版本号必须改，而且是自动从文件里读出来的**（不是你手填进 update.json 的）。忘了改 = 用户看不到更新。详见第 3 节。

---

## 1. 仓库里每个文件是干嘛的

```
repo/
├─ update.json                    ★ 索引。两条通道的版本 / 文件路径 / 更新说明
├─ README.md                      给人看的说明（发版时自动重新生成，别手改主体）
├─ preset/
│   └─ preset-v2.0.json           ★ 预设本体（67 条）
├─ script/
│   └─ orb.js                     ★ 悬浮球脚本（构建产物 + 启动保护包装）
├─ ai/                            给 AI 用的东西
│   ├─ 开发者手册_给AI.md         ← 你正在看的这份
│   ├─ 写给AI的提示词.md          直接复制进对话的指令（让 AI 产补丁）
│   ├─ 条目索引.md                67 条的一览表（identifier / 名字 / 开关 / 字数 / 正文开头）
│   ├─ patch.template.json        补丁模板
│   └─ README_ai.md               增量补丁的 3 步流程（简短版）
└─ tools/
    └─ ai_patch.py                本地合并补丁 + 刷新索引 + 自动写 update.json 的工具
```

**源文件不在这个仓库里**（在 `griffith_icons/`）：

| 源文件 | 产物 | 怎么生成 |
|---|---|---|
| `griffith_icons/orb_v8.html` | `_built.js` → `repo/script/orb.js` | `python build_orb.py` 然后 `python make_repo.py --only script` |
| 酒馆里导出的 `OpenAI Settings/斯德哥尔摩症vX.Y.json` | `repo/preset/preset-vX.Y.json` | `python make_repo.py --only preset` |
| `griffith_icons/_built.js` | 装进酒馆 | `python install_orb.py` |

---

## 2. 预设文件长什么样

### 2.1 顶层字段

`preset-v2.0.json` 顶层有 40 多个键，分三类：

| 类别 | 举例 | 你要不要动 |
|---|---|---|
| **身份** | `name`（`"斯德哥尔摩症v2.0"`） | ★ 要动 —— 版本号就是从这里读的 |
| **采样参数** | `temperature` `top_p` `top_k` `min_p` `repetition_penalty` `frequency_penalty` `presence_penalty` `openai_max_context` `openai_max_tokens` … | **不要动**（用户自己调过的话，更新时这些会跟着远端走，别手贱改） |
| **本体** | `prompts`（条目数组）、`prompt_order`（排序表）、`extensions`（扩展） | ★ 主要动这里 |

当前采样参数（别改）：temperature 1 / top_p 0.95 / top_k 0 / min_p 0 / repetition_penalty 1 / 频率·存在惩罚 0 / max_context 2000000 / max_tokens 16384。

### 2.2 `prompts[]`：单个条目

67 条，每条长这样（字段按出现频率）：

| 字段 | 类型 | 含义 | AI 能不能改 |
|---|---|---|---|
| `identifier` | 字符串 | **稳定编号**，如 `liwe-core`。合并时的主键，全局唯一 | ★ 能，但**绝不能重复、不能随便改已有条目的**（改了 = 用户那边变成"新条目 + 旧条目残留"） |
| `name` | 字符串 | 显示名，如 `✦ Liwe 本体` | 能（用 `rename`，见 4.2） |
| `content` | 字符串 | 条目正文 | ★ 主要改这个 |
| `role` | `"system"` / `"user"` / `"assistant"` | 当前 66 条 system、1 条 user | 新增条目才写 |
| `enabled` | 布尔 | 默认开关（41 关 / 21 开 / 5 条无此字段） | 新增条目才写。**改已有条目不用写** —— 用户自己开的关不会被你重置 |
| `system_prompt` | 布尔 | 是否系统提示词（15 真 / 52 假） | 新增条目照抄 |
| `marker` | 布尔 | 64 条有此字段 | 新增条目照抄 |
| `forbid_overrides` | 布尔 | 60 条有 | 新增条目照抄 |
| `injection_position` | 数字 | `0` = 按相对位置插入（60 条都是 0）；`1` = 插进聊天记录指定深度 | 新增条目照抄 `0` |
| `injection_depth` | 数字 | 深度，主流是 `4`（58 条），2 条是 `1` | 新增条目照抄 `4` |
| `injection_order` | 数字 | 同深度内的顺序，主流 `100` | 新增条目照抄 `100` |
| `injection_trigger` | 数组 | 8 条有（世界书触发） | 别动 |
| `attach_role` / `attach_index` / `attach_side` | — | 6 条有（附加到某角色） | 别动 |

**新增条目照抄这个模板**（只换 `identifier` / `name` / `content` / `enabled`）：

```json
{
  "identifier": "my-new-entry",
  "name": "✹ 我新加的条目",
  "role": "system",
  "enabled": true,
  "system_prompt": false,
  "marker": false,
  "forbid_overrides": false,
  "injection_position": 0,
  "injection_depth": 4,
  "injection_order": 100,
  "content": "正文全文，禁止省略"
}
```

### 2.3 `prompt_order`：排序表

酒馆真正按这个显示顺序。结构：

```json
[ { "character_id": 100001,
    "order": [ {"enabled": false, "identifier": "no-resale"},
               {"enabled": true,  "identifier": "liwe-core"}, … ] } ]
```

规则：
- 一个 block 对应一个角色（`character_id: 100001` 是全局默认）。
- `order[]` 里每一项只存 `identifier` + `enabled`，**不存正文**。
- **新条目必须同时进 `prompts` 和 `prompt_order`**，否则酒馆里看不见它（工具会自动补，手写文件时要自己补）。
- 被 `remove` 删掉的条目，排序表里那条也要一起清掉（工具会自动清，手写时要自己清）。

### 2.4 `extensions`：四个键，只有一个你该碰

| 键 | 内容 | 态度 |
|---|---|---|
| `tavern_helper` | **悬浮球脚本本体**（`scripts` 数组，1 条） | ★★ **绝对不能删**。用户更新预设时脚本会强制保留本地那份；但仓库里的预设如果丢了它，新用户导入就没有悬浮球 |
| `regex_scripts` | 30 条正则（发送层删标签 + 显示层渲染） | 别动。动了会破坏 `<coda>` `<inner>` 等标签的处理 |
| `SPreset` / `baibaiToolkit` | 别的插件存的私有数据 | 别动 |

---

## 3. 版本号（最重要，最容易忘）

### 3.1 三个版本号分别在哪，谁生成

| 版本号 | 存在哪 | 谁生成 |
|---|---|---|
| **预设版本** | 预设 JSON 的 **`name` 字段**里的 `vX.Y`（如 `name: "斯德哥尔摩症v2.0"` → `v2.0`） | `make_repo.py` 用正则从 `name` 里抠出来，写进 `update.json` 和文件名 |
| **脚本版本** | `griffith_icons/orb_v8.html` 第一行附近的 **`var ORB_VER="v1.1";`** | `make_repo.py` 从 html 里抠出来 |
| **面板上显示的** | `update.json` 里的 `preset.version` / `script.version` | 上面两个自动填进去的，**不要手改 update.json 的版本号**（下次发版会被覆盖） |

### 3.2 改了什么 → 改哪个号

| 你改了什么 | 改哪个 | 怎么改 |
|---|---|---|
| 改了条目正文 / 增删条目 / 改采样参数 | **预设版本** | 在酒馆里把预设**另存/改名**为 `斯德哥尔摩症v2.1`（名字里的 v2.1 就是版本号）；或者手改 JSON 的 `name` |
| 改了 `orb_v8.html`（UI / 逻辑 / 头像 / 更新相关） | **脚本版本** | 改 `var ORB_VER="v1.2";` |
| 只改了 README / ai 文档 | **都不用改** | 直接提交 |
| 两个都改了 | 两个都改 | — |

### 3.3 号怎么涨

- 格式 `v主.次`，例如 `v2.0 → v2.1`。
- 小改（改正文、修 bug、调 UI）→ 次版本号 +1。
- 大改（结构变化、条目大换血、合并规则变化）→ 主版本号 +1。
- **只能涨，不能降，也不能重复用过**。用户面板拿 `update.json` 的版本跟自己比对，降号会让他以为没更新。

### 3.4 忘了改会怎样

- 预设号没改：`make_repo.py` 会覆盖同名的 `preset-v2.0.json`，用户那边"已经是 v2.0" → **看不到更新**。
- 脚本号没改：用户脚本已是 v1.1，还是 v1.1 → 面板可能显示可更新（脚本通道目前按"有就提示"走），但**版本号显示不动，用户会以为没生效**。别赌，涨号。

---

## 4. 改预设：三条路

### 4.1 路 A —— 整包导出（适合大改）

1. 在酒馆里改完预设 → 点保存。
2. 预设文件在 `…\data\default-user\OpenAI Settings\斯德哥尔摩症vX.Y.json`。
3. 跑 `python make_repo.py --only preset --plog "改了啥"` —— 它会自动拷到 `repo/preset/preset-vX.Y.json` 并刷新 `update.json`。

**代价**：整包 741KB，用户更新时 67 条全量比对（本地开关/改名会保留，但流量大）。

### 4.2 路 B —— 增量补丁（推荐，AI 友好）

**只写这次动过的条目**，别的字段自动沿用。这是给 AI 用的主路子。

补丁规范（**`_spec` 必须是 `stockholm-preset-patch/1`**）：

```json
{
  "_spec": "stockholm-preset-patch/1",
  "version": "v2.1",
  "changelog": ["一句话说明这次改了什么（会显示在用户的更新弹窗里）"],
  "prompts": [
    { "identifier": "style-lightnovel", "content": "这一条的完整新正文……" }
  ],
  "remove": ["要删的 identifier"],
  "rename": [{ "from": "旧名字 or identifier", "to": "新名字" }],
  "order": ["liwe-core", "world-logic", "…完整 identifier 顺序…"]
}
```

字段规则：

| 字段 | 必填 | 说明 |
|---|---|---|
| `_spec` | 建议 | 写上 `stockholm-preset-patch/1`，两边都认它是补丁 |
| `version` | 建议 | 新版本号。写了会用它生成文件名；不写就沿用基准预设的号 |
| `changelog` | 建议 | 字符串数组，显示在用户弹窗里 |
| `prompts[]` | 否 | 要改/要加的条目。**已有条目可以只写 `identifier` + `content`**，缺的字段自动沿用原值 |
| `remove[]` | 否 | 要删的条目，写 `identifier` 或 `name` 都行 |
| `rename[]` | 否 | 只改名不换正文。`from` 可以写 identifier 也可以写名字 |
| `order[]` | 否 | 完整 identifier 顺序数组，用于重排。**不写就不动顺序** |

**字段继承规则（很重要）**：
补丁里某条只写了 `content`，那么 `role` / `system_prompt` / `marker` / `injection_*` / `forbid_overrides` 等**全部从原条目继承**。
—— 所以 AI 改一条时**只写 content 就够了**，写多了反而可能写错技术字段。

应用补丁：

```bash
python tools/ai_patch.py apply patch.json --version v2.1
# 输出：新预设 -> repo/preset/preset-v2.1.json，update.json 已更新，条目索引已刷新
python tools/ai_patch.py index            # 只刷新 ai/条目索引.md
```

AI 用 ```json 代码块包裹、前后带废话的输出，这个工具**能直接读**，整段粘进文件即可。

### 4.3 路 C —— 手工改 JSON（不推荐，但要知道）

直接编辑 `repo/preset/preset-vX.Y.json`。风险：
- 忘了同步 `prompt_order` → 新条目在酒馆里不显示。
- identifier 写重复 → 合并时错配。
- 改完一定要跑 `python tools/ai_patch.py index` 刷新索引。

### 4.4 用户点「更新」时会发生什么（你必须知道）

按**条目**合并，不是整包覆盖：

| 情况 | 结果 |
|---|---|
| 远端条目内容变了 | **内容跟着远端更新**（这才是"更新"） |
| 用户自己关掉的条目 | **保持关闭**，不会被你重新打开 |
| 用户自己改过的条目名 | **保留他的名字**（你的 `rename` 对他无效） |
| 用户自己加的条目 | **原样保留**，追加到末尾，并补进排序表 |
| 预设名 | 保留用户本地的预设名 |
| 采样参数等顶层字段 | 跟着远端走 |
| `extensions` | 远端优先，但 **`tavern_helper`（悬浮球）强制保留本地** |
| 补丁要删的条目 | 从 `prompts` 和 `prompt_order` 里**一起清掉** |

这条规则在**脚本里**（`__skMerge`）和**工具里**（`tools/ai_patch.py` 的 `merge`）是同一套，改任一边都要同步改另一边。

---

## 5. `update.json` 规范

```json
{
  "_说明": "（可省）给人看的备注",
  "_readme_base": "https://raw.githubusercontent.com/<账号>/<仓库>/main",
  "preset": {
    "version": "v2.0",
    "file": "preset/preset-v2.0.json",
    "changelog": ["首次发布：预设本体 + 悬浮球脚本"]
  },
  "script": {
    "version": "v1.1",
    "file": "script/orb.js",
    "changelog": ["修：…", "补：…"]
  }
}
```

规则：

1. `file` **相对仓库根**写，也可以写完整 `http(s)://` 地址。
2. **文件名必须是英文和数字**。`preset/斯德哥尔摩症_v2.0.json` 这种中文名进 raw URL 不编码会 404（脚本里已加 `encodeURIComponent`，但别给自己找麻烦，用 `preset-v2.0.json`）。
3. **可以只写一条通道**。这次只发脚本 → 只写 `script`，用户面板上「预设」那条显示「未提供」并灰掉。
   （`make_repo.py --only script` 现在会**自动保留上一版的 preset 通道**，前提仓库里那份文件还在。）
4. `changelog` 是字符串数组，会原样显示在用户弹窗里。**用一句人话写清楚改了什么**，别写 "update"。
5. `version` 不要手改 —— 由 `make_repo.py` 从 `name` / `ORB_VER` 自动生成。

---

## 6. 上传流程（可照抄）

### 6.1 改脚本

```bash
cd griffith_icons
# 1) 改 orb_v8.html（记得把 ORB_VER 涨一号）
python build_orb.py                     # 生成 _built.js
python make_repo.py --only script --slog "修了什么"      # → repo/script/orb.js + update.json
python install_orb.py                   # 顺手装进酒馆（本地立刻生效）
```

### 6.2 改预设

```bash
# 整包：
python make_repo.py --only preset --plog "改了什么"
# 补丁：
python tools/ai_patch.py apply patch.json --version v2.1
```

### 6.3 提交并推送

```bash
cd repo
git add -A
git commit -m "预设 v2.1：…… / 脚本 v1.2：……"
git push origin main
```

注意事项：
- **push 大文件（600KB+）在本机约 110 秒**，前台跑容易被超时打断 —— 用后台任务跑，别 Ctrl+C。
- 推完后 **raw 缓存可能延迟几秒到 1 分钟**。验证时用 `https://raw.githubusercontent.com/<账号>/<仓库>/main/update.json` 打开看，浏览器加个 `?1` 破缓存。
- 推送用的 token **只勾 `repo` 权限**就够了。宽权限 token（带 `delete_repo` / `admin:org` / `workflow`）建议回收重开。
- 推送后 `git remote -v` 里**不要留着 token**（`https://<token>@github.com/...`）。如果 URL 里带了，推完执行：
  `git remote set-url origin https://github.com/<账号>/<仓库>.git`

### 6.4 发完必做的三步验证

```bash
cd griffith_icons && node _e2e_upd.js
```

这个脚本会**真打网络**：拉 `update.json` → 拉预设 → 拉脚本 → 用产物里的合并函数跑一遍，检查：
产物里没有演示假数据、版本号三处一致、预设 67 条且都有 identifier、脚本语法合法、合并后本地开关/改名/自定义条目都保住、补丁的 remove/rename/order 都生效。
**48 项全绿才算发完。**

---

## 7. 发布检查清单（发之前一项项过）

- [ ] 预设改了 → `name` 里的版本号涨了？（v2.0 → v2.1）
- [ ] 脚本改了 → `orb_v8.html` 的 `ORB_VER` 涨了？
- [ ] `python build_orb.py` 跑过了？（改了 html 就必须跑）
- [ ] `make_repo.py` 跑过了，`update.json` 两条通道都在、版本号对？
- [ ] `changelog` 写了人话？
- [ ] 新增/删除条目 → `prompt_order` 同步了吗？（用工具就不用管）
- [ ] `node _e2e_upd.js` 48/48？
- [ ] 别的冒烟测试：`_smoke_env.js` 68、`_smoke_av3.js` 33、`_smoke_upd.js` 44、`_merge_test.js` 29，都 0 失败？
- [ ] `extensions.tavern_helper` 还在预设里？
- [ ] 30 条 `regex_scripts` 还在？
- [ ] git commit 信息写清楚了改什么？
- [ ] push 完了？raw 地址打开能看到新内容？

---

## 8. 给 AI（DeepSeek / GPT / Claude）的硬性规则

> 这段可以直接复制进对话。`ai/写给AI的提示词.md` 是同一套的精简版。

1. **只输出一个 JSON 对象**。不要前缀"好的"、不要后缀"希望对你有帮助"、不要用 markdown 代码块包裹（包了也能读，但最好别包）。
2. **只输出这次改动的条目**。没提到的会原样保留，不要重复输出全部 67 条。
3. **`identifier` 从条目索引里原样抄，不许自己造**。索引里没有的 = 新增条目，新增时技术字段要写全（照抄 2.2 的模板）。
4. **`content` 必须写完整全文**。禁止出现「（略）」「……」「同上」「此处省略」——一旦省略，用户更新后那条就真的只剩省略号了。
5. **改已有条目时，只写 `content`**（要改名就用 `rename`）。不要写 `role` / `injection_*` / `enabled` / `system_prompt` / `marker`，写了也不会生效（会自动沿用原值），还可能写错。
6. **不许碰的东西**：`extensions`（尤其是 `tavern_helper` 和 30 条 `regex_scripts`）、`prompt_order`（用 `order` 字段表达重排意图）、采样参数。
7. **不要输出你没被要求改的东西**。用户说"改文风那条"，你就只动那一条。
8. 正文里的换行写 `\n`，引号写 `\"`，别让 JSON 坏掉。
9. 不确定 identifier 就问，或用 `name` 精确匹配 —— **不要猜**。
10. 要删条目用 `remove`（写 identifier），**不要**用"把 content 清空"来代替删除。

### 自检（AI 输出前默念）

- 我这次动的每一条，`identifier` 在索引里找得到吗？
- 每一个 `content` 都是完整全文吗？有没有省略号？
- 我有没有顺手改了不该改的东西？
- 这个 JSON 粘进 JSON 校验器能过吗？

---

## 9. 常见错误对照表

| 症状 | 原因 | 修法 |
|---|---|---|
| 用户看不到更新 | 版本号没涨 | 改 `name` 里的 vX.Y 或 `ORB_VER`，重跑 make_repo |
| 更新弹窗里某条通道灰掉 | `update.json` 里没那条通道 | 用 `--only` 发版后检查；需要就手工补回该段 |
| 拉不到文件（HTTP 404） | 文件名有中文 / 路径写错 / 文件没推上去 | 文件名改英文；`joinUrl` 已做 `encodeURIComponent`；确认 raw 能打开 |
| 拉到的不是 JSON | 地址指向了 GitHub 网页 | 用 `raw.githubusercontent.com`，不是 `github.com/.../blob/...` |
| 新条目在酒馆里不显示 | 没进 `prompt_order` | 用 `ai_patch.py` 合并（自动补）；手写的话手动补进去 |
| 删掉的条目还阴魂不散 | 排序表里没清 | 同上 |
| 用户说"我的开关被重置了" | 补丁/远端写了 `enabled` | 合并规则里本地 `enabled` 恒优先；确认不是用户换了预设 |
| 用户说"我的改名没了" | 补丁写了 `name` | 合并规则里本地改名恒优先；别在补丁里写已有条目的 `name` |
| 更新完悬浮球不见了 | 远端预设丢了 `tavern_helper` | 合并时强制保留本地那份；但仓库里的预设必须带着它（否则新用户没有） |
| 脚本更新完没变化 | 脚本改完要**重开酒馆**才生效 | 提示用户重启 |
| push 卡住/超时 | 大文件，本机约 110 秒 | 后台跑，别中断 |
| 面板显示的地址不对 | 用户填的是文件地址 | 填**仓库根**（`.../main`），不是 `update.json` 的完整地址（老地址也能兼容） |

---

## 10. 禁忌清单（做了会出事）

- ❌ 删 `extensions.tavern_helper` —— 悬浮球直接没了。
- ❌ 动 30 条 `regex_scripts` —— `<coda>` `<inner>` 等标签处理会崩。
- ❌ 改已有条目的 `identifier` —— 用户那边变成"旧条目残留 + 新条目重复"。
- ❌ 把版本号往回退。
- ❌ 在 `content` 里写省略号。
- ❌ 手改 `update.json` 里的 `version`（下次发版会被覆盖）。
- ❌ 用中文文件名。
- ❌ 把带 token 的 remote URL 提交出去。
- ❌ 只改一边（脚本里的 `__skMerge` / 工具里的 `merge`）不同步另一边 —— 两边行为必须一致。

---

## 11. 附录 A：完整补丁示例

**需求**：把「文风·轻小说」写得更冷淡，删掉「方言」那条，给「人类基准·誓言」改名，再把它排到第 3 位。

```json
{
  "_spec": "stockholm-preset-patch/1",
  "version": "v2.1",
  "changelog": [
    "文风·轻小说：语气改冷淡",
    "删掉『方言』那条",
    "『人类基准·誓言』改名并前移"
  ],
  "prompts": [
    {
      "identifier": "style-lightnovel",
      "content": "【文风·轻小说】\n……这里是完整的新正文，一个字都不能省……"
    }
  ],
  "remove": ["dialect"],
  "rename": [{ "from": "✦ 人类基准·誓言", "to": "✦ 人类基准·新约" }],
  "order": ["liwe-core", "world-logic", "human-oath", "narrative-frame"]
}
```

> `order` 只给了 4 个 identifier：这四个按这个顺序排最前，**其余没提到的自动排在后面**（不会丢）。

## 12. 附录 B：一次真实发版记录（v1.0 → v1.1，脚本）

```bash
# 1. 测试先复现问题（用户铁律：先在测试里复现再改）
node _e2e_upd.js          # FAIL：补丁删条目时排序表没清干净；rename/order 被忽略

# 2. 改代码：build_orb.py 里的 __skMerge（JS）补齐 rename / order，
#    排序表整理条件从 st.add 放宽到 (st.add || st.rm)
#    同步确认 tools/ai_patch.py（Python）行为一致

# 3. 涨版本号
#    orb_v8.html: var ORB_VER="v1.0" → "v1.1"

# 4. 构建 + 发版 + 装盘
python build_orb.py
python make_repo.py --only script --slog "修：…" --slog "补：…"
python install_orb.py

# 5. 全量测试
node _e2e_upd.js          # 48/48 PASS
node _smoke_env.js        # 68 PASS
node _smoke_av3.js        # 33 PASS
node _smoke_upd.js        # 44 PASS
node _merge_test.js       # 29 PASS

# 6. 推送
cd repo && git add -A && git commit -m "脚本 v1.1：…" && git push origin main   # 后台跑，约 110 秒

# 7. 验证 raw：update.json / preset / script 三个地址都能打开
```
