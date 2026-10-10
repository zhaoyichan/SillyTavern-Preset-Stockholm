# 斯德哥尔摩 · 状态球 更新仓库

酒馆里点悬浮球 → 面板底部「更新」→ 填仓库根地址：

    https://raw.githubusercontent.com/zhaoyichan/SillyTavern-Preset-Stockholm/main

脚本会自己去拼 `https://raw.githubusercontent.com/zhaoyichan/SillyTavern-Preset-Stockholm/main/update.json` 读索引，**不用写文件名**。
（jsDelivr 也行：`https://cdn.jsdelivr.net/gh/<账号>/<仓库名>@main`）

## 目录

```
update.json                       索引（唯一入口，改版本就改这里）
preset/preset-v2.0.json     预设本体（条目 + 正则 + 采样参数）
script/orb.js          悬浮球脚本本体（整段替换）
ai/写给AI的提示词.md              复制给 DeepSeek 的编辑指令
ai/开发者手册_给AI.md           ★ 完整规则：版本号 / 上传格式 / 发布清单 / AI 硬性规则
ai/patch.template.json            增量补丁模板
ai/条目索引.md                    67 条清单（identifier / 名称 / 字数，自动生成）
tools/ai_patch.py                 合并 AI 补丁 + 发版
```

## update.json 长什么样

```json
{
  "preset": { "version": "v2.0",
              "file": "preset/preset-v2.0.json",
              "changelog": ["这里写这次改了什么"] },
  "script": { "version": "v1.1",
              "file": "script/orb.js",
              "changelog": ["脚本改了什么"] }
}
```

- `version` 只是给人看的字串，脚本不会拿它做强制判断，写清楚就行。
- `file` 相对仓库根；也可以直接填完整 `https://...` 地址。
- 想只更一条通道，就把另一条整个删掉，或只勾一条。

## 两条通道的区别

| | 预设 | 脚本 |
|---|---|---|
| 更新方式 | **按条目合并**：同名条目换内容，你的开关/改名/自定义条目全保留 | **整段替换** |
| 生效 | 立刻 | **重开酒馆** |
| 生成命令 | 从酒馆导出预设 | `python build_orb.py && python make_repo.py` |

## 只改了其中一个，也要发三个文件吗？

**不用。** 哪个改了就发哪个：

```bash
python make_repo.py --only preset --plog "只调了文风条目"   # 只发预设
python make_repo.py --only script --slog "修了面板拖动"      # 只发脚本
python make_repo.py                                          # 两个都发
```

`--only preset` 时 `update.json` 里就**不会写 script 那条**，
用户那边脚本通道会自动灰掉显示「仓库这次没提供」，不会报错、也不会被旧脚本覆盖。

## 发布流程

1. 改完预设 → 从酒馆导出覆盖 `preset/*.json`，跑 `python make_repo.py --only preset --plog "…"`
2. 改完脚本 → `python build_orb.py && python make_repo.py --only script --slog "…"`
   （脚本版本号在 `orb_v8.html` 的 `ORB_VER`）
3. `git add . && git commit -m "..." && git push`
4. 等 CDN 生效：raw.githubusercontent 基本即时，jsDelivr 可能要几分钟

## 还有一条路：本地导入

用户不联网也能装：悬浮球 → 面板底部「更新」→ **导入预设文件** / **导入脚本文件**，
直接选本地的 `.json` / `.js` 就行，流程和在线更新一样（预设仍是按条目合并，先给清单再写入）。

## 用 AI（DeepSeek）写预设：增量补丁流程

> 📘 **要完整规则（版本号怎么定、仓库怎么传、发布清单、禁忌）看这份：
> [`开发者手册_给AI.md`](开发者手册_给AI.md)。**
> 下面只是"让 AI 产补丁"的 3 步速查。

预设 67 条、正文 2.5 万字，**别让 AI 每次把整个预设吐一遍**——又慢又容易在某条里塞省略号。
正确做法是让它只输出「这次改了哪几条」的**补丁**：

```
ai/写给AI的提示词.md   +   ai/条目索引.md   +   要改那几条原文   +   一句话需求
                                  ↓ 贴进 DeepSeek 对话
                            AI 吐出一段 JSON（补丁）
                                  ↓ 存成 patch.json
        python tools/ai_patch.py apply patch.json --version v2.1
                                  ↓
              出新预设 + 改 update.json + 刷新条目索引 → git push
```

补丁长这样（只写改动的条目，缺的字段自动沿用原值）：

```json
{
  "_spec": "stockholm-preset-patch/1",
  "version": "v2.1",
  "changelog": ["文风·轻小说 语气改冷淡"],
  "prompts": [ { "identifier": "style-lightnovel", "content": "……完整新正文……" } ],
  "remove": ["dialect"]
}
```

`tools/ai_patch.py` 也能读 AI 用代码块包裹、前后还带废话的整段输出，直接存文件即可。

> 用户侧同样认这个补丁：酒馆里「更新 → 导入预设文件」选它就按条目合并生效，不必等仓库。
