# -*- coding: utf-8 -*-
"""把 AI（DeepSeek 等）吐出来的「增量补丁」合并进预设，并自动发版。

用法：
    python ai_patch.py index                       # 重新生成 repo/ai/条目索引.md
    python ai_patch.py apply patch.json            # 合并补丁 → 出新预设 + 改 update.json
    python ai_patch.py apply patch.json --version v2.1
    python ai_patch.py apply patch.json --base 某份预设.json

patch.json 可以是从 AI 对话里整段复制的（带 ```json 围栏、前后有废话都能读）。
"""
import io, os, re, sys, json, glob, argparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PRESET_DIR = os.path.join(ROOT, 'preset')
AI_DIR = os.path.join(ROOT, 'ai')
UPDATE = os.path.join(ROOT, 'update.json')


def load_json(p):
    return json.load(io.open(p, encoding='utf-8'))


def newest_preset():
    fs = sorted(glob.glob(os.path.join(PRESET_DIR, '*.json')), key=os.path.getmtime, reverse=True)
    return fs[0] if fs else None


def loose_parse(t):
    """容忍 ```json 围栏、前后废话、AI 爱加的尾注"""
    s = t.strip()
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', s)
    if m:
        s = m.group(1).strip()
    try:
        return json.loads(s)
    except Exception:
        pass
    a, b = s.find('{'), s.rfind('}')
    if a >= 0 and b > a:
        try:
            return json.loads(s[a:b + 1])
        except Exception:
            pass
    return None


# ---------- 合并（规则与悬浮球脚本里的 __skMerge 完全一致） ----------
def key(p):
    return p.get('identifier') or p.get('name') or ''


def kill_set(patch):
    s = set()
    for x in (patch.get('remove') or []):
        if isinstance(x, str):
            if x:
                s.add(x)
        elif isinstance(x, dict):
            if x.get('identifier'):
                s.add(x['identifier'])
            if x.get('name'):
                s.add(x['name'])
    return s


def merge(base, patch):
    lp = base.get('prompts') or []
    rp = patch.get('prompts') or []
    kill = kill_set(patch)

    by_id, by_name = {}, {}
    for i, p in enumerate(lp):
        k = key(p)
        if k and k not in by_id:
            by_id[k] = i
        if p.get('name') and p['name'] not in by_name:
            by_name[p['name']] = i

    def find(r):
        k = key(r)
        if k and k in by_id:
            return by_id[k]
        if r.get('name') and r['name'] in by_name:
            return by_name[r['name']]
        return -1

    out, used, st = [], {}, {'upd': 0, 'add': 0, 'kept': 0, 'rm': 0}
    for r in rp:
        i = find(r)
        it = json.loads(json.dumps(r))
        if i >= 0:
            used[i] = 1
            lo = lp[i]
            for k, v in lo.items():            # 缺的字段从本地继承
                if it.get(k) is None:
                    it[k] = v
            if lo.get('name') and lo['name'] != r.get('name'):
                it['name'] = lo['name']        # 保留改名
            if lo.get('enabled') is not None:
                it['enabled'] = lo['enabled']  # 保留开关
            st['upd'] += 1
        else:
            st['add'] += 1
        if (it.get('identifier') in kill) or (it.get('name') in kill):
            continue
        out.append(it)

    for i, l in enumerate(lp):
        if i in used:
            continue
        if (l.get('identifier') in kill) or (l.get('name') in kill):
            st['rm'] += 1
            continue
        out.append(json.loads(json.dumps(l)))
        st['kept'] += 1

    # rename：只改名不换内容
    for rn in (patch.get('rename') or []):
        f, t = rn.get('from'), rn.get('to')
        if not f or not t:
            continue
        for it in out:
            if it.get('identifier') == f or it.get('name') == f:
                it['name'] = t

    # 排序表
    order = None
    ids = patch.get('order') or []
    if ids:
        have = {it['identifier']: it for it in out if it.get('identifier')}
        seq = [i for i in ids if i in have]
        extra = [i for i in have if i not in ids]
        seq = seq + extra
        blocks = base.get('prompt_order') or [{'character_id': 100001, 'order': []}]
        order = []
        for b in blocks:
            order.append({
                'character_id': b.get('character_id', 100001),
                'order': [{'enabled': bool(have[i].get('enabled')), 'identifier': i} for i in seq]
            })
    elif base.get('prompt_order'):
        order = json.loads(json.dumps(base['prompt_order']))
        # 删掉的 identifier 也从排序表里去掉
        if kill:
            for b in order:
                b['order'] = [o for o in (b.get('order') or [])
                              if not (o.get('identifier') in kill)]
        # 补丁新增的条目必须补进排序表，否则酒馆里看不到它
        if st['add']:
            in_order = set()
            for b in order:
                for o in (b.get('order') or []):
                    if o.get('identifier'):
                        in_order.add(o['identifier'])
            news = [it['identifier'] for it in out
                    if it.get('identifier') and it['identifier'] not in in_order]
            for b in order:
                for i in news:
                    b.setdefault('order', []).append({'enabled': bool(
                        next(x for x in out if x.get('identifier') == i).get('enabled')),
                        'identifier': i})

    base['prompts'] = out
    if order:
        base['prompt_order'] = order
    return base, st


# ---------- 条目索引 ----------
def gen_index(preset_path):
    j = load_json(preset_path)
    lines = ['# 条目索引（给 AI 看的）', '',
             '> 由 `tools/ai_patch.py index` 自动生成，改完预设记得重新生成一次。',
             '> 复制这个表 + `写给AI的提示词.md` 里的指令一起发给 AI。', '',
             '共 %d 条。identifier 是稳定编号，改动时用它；name 是显示名。' % len(j.get('prompts', [])),
             '',
             '| identifier | 显示名 | 默认开关 | 字数 | 正文开头 |',
             '|---|---|---|---|---|']
    for p in j.get('prompts', []):
        c = (p.get('content') or '').replace('\n', ' ').replace('|', '/')
        head = c[:38] + ('…' if len(c) > 38 else '')
        lines.append('| `%s` | %s | %s | %d | %s |' % (
            p.get('identifier', ''), p.get('name', ''),
            '开' if p.get('enabled') else '关', len(p.get('content') or ''), head))
    lines += ['', '## 新增条目要照抄的字段模板', '', '```json',
              json.dumps({k: v for k, v in (j['prompts'][1]).items()}, ensure_ascii=False, indent=2),
              '```', '',
              '（role / injection_position / injection_depth / injection_order / system_prompt / marker 这些照抄，只换 content 和 enabled）']
    dst = os.path.join(AI_DIR, '条目索引.md')
    io.open(dst, 'w', encoding='utf-8').write('\n'.join(lines))
    print('条目索引 ->', dst, len(j.get('prompts', [])), '条')


# ---------- 主流程 ----------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['index', 'apply'])
    ap.add_argument('patch', nargs='?')
    ap.add_argument('--base', default=None)
    ap.add_argument('--version', default=None)
    a = ap.parse_args()

    base_path = a.base or newest_preset()
    if not base_path or not os.path.exists(base_path):
        sys.exit('找不到基准预设：' + str(base_path))

    if a.cmd == 'index':
        gen_index(base_path)
        return

    if not a.patch or not os.path.exists(a.patch):
        sys.exit('找不到补丁文件：' + str(a.patch))

    patch = loose_parse(io.open(a.patch, encoding='utf-8').read())
    if patch is None:
        sys.exit('补丁不是合法 JSON（AI 输出的话，把 ``` 代码块一起复制进来试试）')
    if isinstance(patch, list):
        patch = {'prompts': patch}

    base = load_json(base_path)
    merged, st = merge(base, patch)
    print('基准:', os.path.basename(base_path))
    print('合并结果: 更新 %d / 新增 %d / 保留 %d / 删除 %d' % (st['upd'], st['add'], st['kept'], st['rm']))

    ver = a.version or patch.get('version')
    if not ver:
        m = re.search(r'_v([\d.]+)\.json$', os.path.basename(base_path))
        ver = 'v%s' % (m.group(1) if m else '2.0')
        print('没给版本号，沿用', ver)

    dst = os.path.join(PRESET_DIR, 'preset-%s.json' % ver)
    io.open(dst, 'w', encoding='utf-8').write(json.dumps(merged, ensure_ascii=False, indent=1))
    print('新预设 ->', dst)

    # update.json：只动 preset 通道，脚本通道保持原样
    up = load_json(UPDATE) if os.path.exists(UPDATE) else {}
    up['preset'] = {
        'version': ver,
        'file': os.path.relpath(dst, ROOT).replace('\\', '/'),
        'changelog': patch.get('changelog') or ['（作者没写更新说明）']
    }
    io.open(UPDATE, 'w', encoding='utf-8').write(json.dumps(up, ensure_ascii=False, indent=2))
    print('update.json 已更新（preset 通道 -> %s）' % ver)

    gen_index(dst)
    print('\n接下来：git add . && git commit && git push')


if __name__ == '__main__':
    main()
