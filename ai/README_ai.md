## 用 AI（DeepSeek）写预设：增量补丁流程

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
