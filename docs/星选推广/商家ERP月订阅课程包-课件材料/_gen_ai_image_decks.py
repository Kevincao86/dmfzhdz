# -*- coding: utf-8 -*-
"""
商家ERP月订阅课程 · AI 生图讲义管线

流程：
1. 理解单课 md 讲义 → 规划不少于 20 页幻灯（每页一条生图 prompt）
2. 外部/Agent 按 prompt 生成 PNG 落入 slides/
3. 将图片写入每课 HTML（全屏翻页投屏）

用法：
  python3 _gen_ai_image_decks.py                 # 规划全部 + 有图则写 HTML
  python3 _gen_ai_image_decks.py --plan-only
  python3 _gen_ai_image_decks.py --html-only
  python3 _gen_ai_image_decks.py --lesson 0.1
"""
from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "html-讲义"
MIN_SLIDES = 20

STYLE = (
    "Professional 16:9 Chinese business training PowerPoint slide for 灵祺商家ERP "
    "本地生活商家AI经营实操营. Deep navy (#0b1220) background, teal (#2dd4bf) accents, "
    "crisp white Chinese typography, clean infographic layout, premium consulting look. "
    "NO purple gradients, NO neon glow overload, NO English-only text. "
    "All key Chinese labels must be sharp and readable. Single cohesive full-bleed slide."
)

LESSON_GLOBS = [
    "模块*/[0-9].*.md",
    "直播场次编排/第*.md",
]


def esc(s: str) -> str:
    return html.escape((s or "").strip(), quote=True)


def strip_md(s: str) -> str:
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"`(.+?)`", r"\1", s)
    s = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", s)
    return s.strip()


def parse_meta(text: str) -> dict[str, str]:
    meta: dict[str, str] = {}
    for m in re.finditer(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$", text, re.M):
        k, v = m.group(1).strip(), m.group(2).strip()
        if k in ("项", "----", "---") or set(k) <= {"-"}:
            continue
        meta[k] = strip_md(v)
    h1 = re.search(r"^#\s+(.+)$", text, re.M)
    if h1 and "课名" not in meta:
        meta["课名"] = strip_md(h1.group(1))
    return meta


def split_h2(text: str) -> dict[str, str]:
    parts = re.split(r"\n(?=## )", text)
    out: dict[str, str] = {}
    for p in parts:
        p = p.strip()
        if not p.startswith("## "):
            continue
        title, _, body = p.partition("\n")
        out[title[3:].strip()] = body
    return out


def find_sec(sections: dict[str, str], *keys: str) -> str:
    for k, v in sections.items():
        for key in keys:
            if k.startswith(key) or key in k:
                return v
    return ""


def extract_bullets(text: str) -> list[str]:
    items: list[str] = []
    for ln in text.split("\n"):
        m = re.match(r"^[-*]\s+(.+)$", ln.strip())
        if m:
            items.append(strip_md(m.group(1)))
            continue
        m = re.match(r"^\d+\.\s+(.+)$", ln.strip())
        if m:
            items.append(strip_md(m.group(1)))
    return items


def extract_paras(text: str) -> list[str]:
    paras: list[str] = []
    buf: list[str] = []
    for ln in text.split("\n"):
        s = ln.strip()
        if not s or s.startswith("|") or s.startswith("#") or s.startswith("-") or s.startswith("*") or re.match(
            r"^\d+\.", s
        ):
            if buf:
                paras.append(strip_md(" ".join(buf)))
                buf = []
            if s.startswith(">"):
                paras.append(strip_md(s.lstrip("> ").strip()))
            continue
        if s.startswith(">"):
            if buf:
                paras.append(strip_md(" ".join(buf)))
                buf = []
            paras.append(strip_md(s.lstrip("> ").strip()))
            continue
        buf.append(s)
    if buf:
        paras.append(strip_md(" ".join(buf)))
    return [p for p in paras if p and len(p) > 1]


def split_h3_chunks(body: str) -> list[tuple[str, str]]:
    body = re.sub(r"\n### 2\.1[\s\S]*?(?=\n## |\Z)", "\n", body)
    body = re.split(r"\n## 3\.", body)[0]
    if "### " not in body:
        return [("", body.strip())] if body.strip() else []
    parts = re.split(r"\n(?=### )", body)
    chunks: list[tuple[str, str]] = []
    lead = parts[0].strip()
    if lead and not lead.startswith("### "):
        chunks.append(("", lead))
        parts = parts[1:]
    for p in parts:
        if not p.startswith("### "):
            continue
        title_line, _, rest = p.partition("\n")
        chunks.append((strip_md(title_line[4:]), rest.strip()))
    return chunks or [("", body.strip())]


def parse_md_table(block: str) -> tuple[list[str], list[list[str]]] | None:
    lines = [ln.strip() for ln in block.strip().split("\n") if ln.strip().startswith("|")]
    if len(lines) < 2:
        return None

    def cols(ln: str) -> list[str]:
        return [strip_md(c) for c in ln.strip("|").split("|")]

    header = cols(lines[0])
    if all(re.fullmatch(r":?-{3,}:?", c or "") for c in cols(lines[1])):
        rows = [cols(ln) for ln in lines[2:]]
    else:
        rows = [cols(ln) for ln in lines[1:]]
    rows = [r for r in rows if any(r) and not all(set(x) <= {"-"} for x in r)]
    if not header or not rows:
        return None
    return header, rows


def clip(s: str, n: int = 90) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    return s if len(s) <= n else s[: n - 1] + "…"


def lesson_paths() -> list[Path]:
    files: list[Path] = []
    for g in LESSON_GLOBS:
        files.extend(sorted(ROOT.glob(g)))
    # de-dup
    seen: set[Path] = set()
    out: list[Path] = []
    for f in files:
        if f in seen or f.name.startswith("00-"):
            continue
        seen.add(f)
        out.append(f)
    return out


def out_dir_for(md: Path) -> Path:
    rel = md.relative_to(ROOT)
    stem = md.stem
    return OUT / rel.parent / stem


def prompt_for(kind: str, code: str, title: str, **kw) -> str:
    bits = [STYLE, f"Course {code} · {title}."]
    if kind == "cover":
        bits.append(
            f"Cover slide. Huge title: {title}. Subtitle: {kw.get('module','')}. "
            f"Badge: 课号 {code}. Line: {kw.get('gain','')}. Duration: {kw.get('dur','')}. "
            f"Visual metaphor: {kw.get('visual','local lifestyle merchant + AI workflow')}."
        )
    elif kind == "goal":
        items = " | ".join(kw.get("items") or [])
        bits.append(
            f"Learning goals slide. Title: 本课你将带走. Lead: {kw.get('lead','')}. "
            f"3-5 goal cards: {items}."
        )
    elif kind == "agenda":
        items = " | ".join(kw.get("items") or [])
        bits.append(f"Agenda slide. Title: 本课结构. Numbered outline cards: {items}.")
    elif kind == "insight":
        bits.append(
            f"Insight slide. Title: {kw.get('htag','要点')}. "
            f"Big statement: {kw.get('lead','')}. Supporting bullets: {' | '.join(kw.get('items') or [])}."
        )
    elif kind == "cards":
        cards = " ; ".join(f"{c.get('t','')}: {c.get('b','')}" for c in (kw.get("cards") or [])[:6])
        bits.append(f"Card grid slide. Title: {kw.get('htag','核心要点')}. Cards: {cards}.")
    elif kind == "flow":
        bits.append(
            f"Horizontal process flow slide. Title: {kw.get('htag','流程')}. "
            f"Steps with arrows: {' → '.join(kw.get('steps') or [])}. Note: {kw.get('note','')}."
        )
    elif kind == "table":
        rows = " / ".join(" · ".join(r[:4]) for r in (kw.get("rows") or [])[:5])
        bits.append(
            f"Comparison table slide. Title: {kw.get('htag','对照表')}. "
            f"Headers: {' | '.join(kw.get('header') or [])}. Rows: {rows}."
        )
    elif kind == "split":
        bits.append(
            f"Two-column contrast slide. Title: {kw.get('htag','对照')}. "
            f"Left: {kw.get('left','')}. Right: {kw.get('right','')}."
        )
    elif kind == "quote":
        bits.append(
            f"Quote/takeaway slide. Title: 记住这句话. Large quote: {kw.get('quote','')}. "
            f"Side notes: {' | '.join(kw.get('points') or [])}."
        )
    elif kind == "checklist":
        bits.append(
            f"Checklist slide. Title: {kw.get('htag','演示路径')}. "
            f"Checked steps: {' | '.join(kw.get('items') or [])}."
        )
    elif kind == "homework":
        bits.append(
            f"Homework slide. Title: 作业 / 验收. Action items: {' | '.join(kw.get('items') or [])}."
        )
    elif kind == "map":
        bits.append(
            f"Module map slide. Title: {kw.get('htag','课程地图')}. "
            f"Nodes: {' → '.join(kw.get('steps') or [])}. Caption: {kw.get('note','')}."
        )
    elif kind == "end":
        bits.append(
            f"Closing slide. Title: 本课结束. Course {code} {title}. "
            f"Takeaway: {kw.get('gain','')}. CTA: 下一课继续实操. Inspiring local-business + AI visual."
        )
    else:
        bits.append(f"Content slide. Title: {kw.get('htag','讲义')}. Body: {kw.get('body','')}.")
    return " ".join(bits)


def expand_to_min(slides: list[dict], meta: dict, sections: dict[str, str]) -> list[dict]:
    """Pad thoughtfully to MIN_SLIDES using lecture leftovers / structural pages."""
    code = meta.get("课号", "")
    title = meta.get("课名", "")
    fillers: list[dict] = []

    # structural pads
    pads = [
        {
            "file": "",
            "kind": "insight",
            "htag": "为什么现在必须改",
            "lead": "散点经营一定累：同一件事拆到多个后台、多个人、多轮微信确认。",
            "items": ["多入口 = 多口径", "无状态 = 月底对不清", "无确认 = AI 不能替你签字"],
            "prompt": "",
        },
        {
            "file": "",
            "kind": "map",
            "htag": "灵祺流水线一览",
            "steps": ["开团/组品", "招达人", "做内容", "曝光获客", "对账复盘"],
            "note": "AI 提案 · 你确认 · 少雇人少外包少踩坑",
            "prompt": "",
        },
        {
            "file": "",
            "kind": "insight",
            "htag": "人机分工",
            "lead": "AI 负责提案与草稿，你负责确认与签字。",
            "items": ["可预览", "可回退", "关键动作有状态"],
            "prompt": "",
        },
        {
            "file": "",
            "kind": "split",
            "htag": "旧方式 vs 流水线",
            "left": "旧：微信群跟单 + 表格 + 外包突击",
            "right": "新：订单状态机 + AI 产线 + 预览确认",
            "prompt": "",
        },
        {
            "file": "",
            "kind": "insight",
            "htag": "本课边界",
            "lead": "先对齐概念与路径，敏感信息打码，用测试店心态点一遍。",
            "items": ["不堆无关按钮", "一课一个主动作", "作业可验收"],
            "prompt": "",
        },
        {
            "file": "",
            "kind": "checklist",
            "htag": "听课检查清单",
            "items": ["能复述本课目标", "能指出卡点在哪一步", "能说出下一动作入口", "完成作业打卡"],
            "prompt": "",
        },
        {
            "file": "",
            "kind": "quote",
            "htag": "金句",
            "quote": meta.get("学员收获") or "把今天的要点落到测试店里点一遍",
            "points": ["少雇人", "少外包", "少踩坑"],
            "prompt": "",
        },
        {
            "file": "",
            "kind": "insight",
            "htag": "常见踩坑",
            "lead": "最容易翻车的不是不会用，而是跳过确认、跳过状态、跳过核对。",
            "items": ["未预览就发布", "状态卡在群聊里", "月底才想起对账"],
            "prompt": "",
        },
    ]

    # pull more paras from lecture as insight slides
    lecture = find_sec(sections, "2.")
    for h3, chunk in split_h3_chunks(lecture):
        paras = extract_paras(chunk)
        bullets = extract_bullets(chunk)
        if not paras and not bullets:
            continue
        fillers.append(
            {
                "file": "",
                "kind": "insight",
                "htag": h3 or "讲义深化",
                "lead": clip(paras[0] if paras else bullets[0], 100),
                "items": [clip(x, 60) for x in (bullets or paras[1:])[:4]],
                "prompt": "",
            }
        )

    i = 0
    while len(slides) < MIN_SLIDES and i < len(pads) + len(fillers):
        src = fillers[i] if i < len(fillers) else pads[i - len(fillers)]
        i += 1
        # avoid duplicate titles
        if any(s.get("htag") == src.get("htag") and s.get("kind") == src.get("kind") for s in slides):
            continue
        slides.append(dict(src))

    # last resort numbered deepeners
    n = 1
    while len(slides) < MIN_SLIDES:
        slides.append(
            {
                "file": "",
                "kind": "insight",
                "htag": f"落地提醒 · {n}",
                "lead": f"{code} {title}：把概念变成可重复动作，而不是一次性热闹。",
                "items": ["入口清晰", "状态可追踪", "结果可验收"],
                "prompt": "",
            }
        )
        n += 1

    # ensure end slide last
    ends = [s for s in slides if s.get("kind") == "end"]
    slides = [s for s in slides if s.get("kind") != "end"]
    if not ends:
        ends = [{"file": "", "kind": "end", "gain": meta.get("学员收获", ""), "prompt": ""}]
    slides.append(ends[0])
    return slides


def plan_slides(meta: dict, sections: dict[str, str]) -> list[dict]:
    code = meta.get("课号") or "课"
    title = meta.get("课名") or "课件"
    module = meta.get("所属模块", "")
    dur = meta.get("建议时长", "")
    gain = meta.get("学员收获", "")

    slides: list[dict] = []
    slides.append(
        {
            "kind": "cover",
            "htag": "封面",
            "module": module,
            "dur": dur,
            "gain": gain,
            "visual": "local store owner, multi-platform apps, AI pipeline ribbon",
        }
    )

    goals = find_sec(sections, "1.")
    gparas = extract_paras(goals)
    gbullets = extract_bullets(goals)
    slides.append(
        {
            "kind": "goal",
            "htag": "本课目标",
            "lead": clip(gparas[0] if gparas else gain, 110),
            "items": [clip(x, 48) for x in (gbullets or ([gain] if gain else gparas[1:5]))[:5]],
        }
    )

    # agenda from h3 titles
    lecture = find_sec(sections, "2.")
    h3s = [h for h, _ in split_h3_chunks(lecture) if h and not h.startswith("2.1")]
    if h3s:
        slides.append(
            {
                "kind": "agenda",
                "htag": "本课结构",
                "items": [clip(h, 36) for h in h3s[:8]],
            }
        )

    for h3, chunk in split_h3_chunks(lecture):
        if h3.startswith("2.1"):
            continue
        table = parse_md_table(chunk)
        bullets = extract_bullets(chunk)
        paras = extract_paras(chunk)
        quotes = [strip_md(ln.lstrip("> ").strip()) for ln in chunk.split("\n") if ln.strip().startswith(">")]

        if table:
            header, rows = table
            slides.append(
                {
                    "kind": "table",
                    "htag": h3 or "要点对照",
                    "header": header[:5],
                    "rows": [r[:5] for r in rows[:6]],
                    "note": clip(paras[0], 80) if paras else "",
                }
            )
            continue

        if "→" in (h3 or "") or re.search(r"流程|步骤|状态机|六步|五步", h3 or ""):
            steps = [s.strip() for s in re.split(r"→|－|—|>", h3) if s.strip()]
            if len(steps) < 3 and bullets:
                steps = [clip(b, 24) for b in bullets[:6]]
            if len(steps) >= 3:
                slides.append(
                    {
                        "kind": "flow",
                        "htag": h3 or "流程",
                        "steps": steps[:7],
                        "note": clip(paras[0], 80) if paras else "",
                    }
                )
                continue

        if len(bullets) >= 3:
            cards = []
            for b in bullets[:6]:
                if "：" in b or ":" in b:
                    sep = "：" if "：" in b else ":"
                    a, c = b.split(sep, 1)
                    cards.append({"t": clip(a, 18), "b": clip(c, 48)})
                else:
                    cards.append({"t": clip(b, 18), "b": clip(b, 48)})
            slides.append({"kind": "cards", "htag": h3 or "核心要点", "cards": cards})
            if len(bullets) > 6:
                cards2 = []
                for b in bullets[6:12]:
                    if "：" in b or ":" in b:
                        sep = "：" if "：" in b else ":"
                        a, c = b.split(sep, 1)
                        cards2.append({"t": clip(a, 18), "b": clip(c, 48)})
                    else:
                        cards2.append({"t": clip(b, 18), "b": clip(b, 48)})
                slides.append({"kind": "cards", "htag": (h3 or "核心要点") + "（续）", "cards": cards2})
            continue

        if len(bullets) == 2:
            slides.append(
                {
                    "kind": "split",
                    "htag": h3 or "对照理解",
                    "left": clip(bullets[0], 70),
                    "right": clip(bullets[1], 70),
                }
            )
            continue

        if quotes:
            slides.append(
                {
                    "kind": "quote",
                    "htag": h3 or "记住这句话",
                    "quote": clip(quotes[0], 120),
                    "points": [clip(x, 50) for x in (paras[:3] if paras else bullets[:3])],
                }
            )
            continue

        if paras or bullets:
            slides.append(
                {
                    "kind": "insight",
                    "htag": h3 or "讲义要点",
                    "lead": clip((paras or bullets)[0], 110),
                    "items": [clip(x, 60) for x in (bullets or paras[1:])[:4]],
                }
            )

    demo = find_sec(sections, "4.")
    if demo:
        items = extract_bullets(demo) or extract_paras(demo)[:6]
        if items:
            slides.append({"kind": "checklist", "htag": "演示 / 操作路径", "items": [clip(x, 55) for x in items[:8]]})

    tips = find_sec(sections, "5.")
    if tips:
        items = extract_bullets(tips) or extract_paras(tips)[:5]
        if items:
            slides.append(
                {
                    "kind": "quote",
                    "htag": "口播与转化要点",
                    "quote": clip(items[0], 110),
                    "points": [clip(x, 55) for x in items[1:5]],
                }
            )

    for k, v in sections.items():
        if "作业" in k or "验收" in k:
            items = extract_bullets(v) or extract_paras(v)[:6]
            if items:
                slides.append({"kind": "homework", "htag": "作业 / 验收", "items": [clip(x, 55) for x in items[:8]]})

    slides.append({"kind": "end", "htag": "结束", "gain": gain or "把今天的要点落到测试店里点一遍"})

    slides = expand_to_min(slides, meta, sections)

    # finalize filenames + prompts
    final: list[dict] = []
    for idx, s in enumerate(slides, 1):
        kind = s.get("kind") or "insight"
        fname = f"{idx:02d}-{kind}.jpg"
        p = prompt_for(
            kind,
            code,
            title,
            module=module,
            dur=dur,
            gain=gain,
            htag=s.get("htag", ""),
            lead=s.get("lead", ""),
            items=s.get("items"),
            cards=s.get("cards"),
            steps=s.get("steps"),
            note=s.get("note", ""),
            header=s.get("header"),
            rows=s.get("rows"),
            left=s.get("left", ""),
            right=s.get("right", ""),
            quote=s.get("quote", ""),
            points=s.get("points"),
            visual=s.get("visual", ""),
            body=s.get("lead") or " | ".join(s.get("items") or []),
        )
        final.append(
            {
                "index": idx,
                "file": fname,
                "kind": kind,
                "htag": s.get("htag", ""),
                "prompt": p,
                "meta": {k: s.get(k) for k in s if k not in ("prompt", "file")},
            }
        )
    return final


HTML_SHELL = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{title}</title>
<style>
  html,body{{height:100%;margin:0;background:#05080f;color:#fff;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;overflow:hidden}}
  .deck{{position:relative;width:100vw;height:100vh}}
  .slide{{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#05080f}}
  .slide.active{{display:flex}}
  .slide img{{width:100vw;height:100vh;object-fit:contain;background:#0b1220}}
  .bar{{position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;
    background:linear-gradient(transparent,rgba(0,0,0,.72));font-size:13px;color:#cbd5e1;z-index:5}}
  .bar b{{color:#5eead4}}
  .hint{{opacity:.75}}
</style>
</head>
<body>
<div class="deck" id="deck">
{slides}
</div>
<div class="bar">
  <span>{code} · {title_short}</span>
  <span><b id="idx">1</b> / {n}　<span class="hint">← → / 空格翻页</span></span>
</div>
<script>
const slides=[...document.querySelectorAll('.slide')];
let i=0;
function show(n){{
  i=Math.max(0,Math.min(slides.length-1,n));
  slides.forEach((s,k)=>s.classList.toggle('active',k===i));
  document.getElementById('idx').textContent=String(i+1);
  history.replaceState(null,'','#'+(i+1));
}}
document.addEventListener('keydown',e=>{{
  if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){{e.preventDefault();show(i+1)}}
  if(['ArrowLeft','PageUp'].includes(e.key)){{e.preventDefault();show(i-1)}}
  if(e.key==='Home')show(0);
  if(e.key==='End')show(slides.length-1);
}});
document.addEventListener('click',e=>{{
  if(e.clientX>innerWidth*0.55)show(i+1); else show(i-1);
}});
const h=parseInt((location.hash||'#1').slice(1),10); show(isNaN(h)?0:h-1);
</script>
</body>
</html>
"""


def write_html(lesson_dir: Path, meta: dict, plan: list[dict]) -> Path:
    code = meta.get("课号", "")
    title = meta.get("课名") or lesson_dir.name
    imgs = []
    for s in plan:
        rel = f"slides/{s['file']}"
        p = lesson_dir / "slides" / s["file"]
        if not p.exists():
            # allow missing during plan-only; still reference
            pass
        imgs.append(f'<section class="slide"><img src="{esc(rel)}" alt="{esc(s.get("htag") or s["file"])}"/></section>')
    html_doc = HTML_SHELL.format(
        title=esc(f"{code} {title}"),
        code=esc(code),
        title_short=esc(title[:40]),
        n=len(plan),
        slides="\n".join(imgs),
    )
    out = lesson_dir / f"{lesson_dir.name}.html"
    # prefer short name matching stem
    out = lesson_dir.parent / f"{lesson_dir.name}.html"
    # Actually keep html beside slides folder: lesson_dir is .../0.1-xxx which contains slides/
    # Put HTML at lesson_dir / index.html AND parent copy for index listing
    (lesson_dir / "index.html").write_text(html_doc, encoding="utf-8")
    # also flat html next to folder for convenience
    flat = lesson_dir.parent / f"{lesson_dir.name}.html"
    # redirect flat to folder index
    flat.write_text(
        f"<!DOCTYPE html><meta charset=utf-8><meta http-equiv=refresh content='0;url={esc(lesson_dir.name)}/index.html'>"
        f"<p><a href=\"{esc(lesson_dir.name)}/index.html\">{esc(code)} {esc(title)}</a></p>",
        encoding="utf-8",
    )
    return lesson_dir / "index.html"


def build_index(items: list[tuple[str, str, str, int, int]]) -> None:
    """items: code, title, href, planned, have_imgs"""
    by_mod: dict[str, list] = {}
    for code, title, href, planned, have in items:
        mod = href.split("/")[0] if "/" in href else "其他"
        by_mod.setdefault(mod, []).append((code, title, href, planned, have))

    blocks = [
        "<!DOCTYPE html><html lang=zh-CN><head><meta charset=utf-8><title>灵祺商家ERP月订阅 · AI生图讲义</title>",
        "<style>body{font-family:PingFang SC,Microsoft YaHei,sans-serif;max-width:960px;margin:40px auto;padding:0 20px;background:#0b1220;color:#e2e8f0}",
        "a{color:#5eead4} h1{color:#fff} h2{margin-top:2em;color:#94a3b8;font-size:1rem;text-transform:none}",
        "li{margin:.45em 0}.ok{color:#34d399}.bad{color:#fbbf24}</style></head><body>",
        "<h1>灵祺商家ERP月订阅课程 · AI生图讲义</h1>",
        "<p>每课 ≥20 页图片幻灯。打开单课后用 ← → / 空格翻页。</p>",
        "<p>重新规划：<code>python3 _gen_ai_image_decks.py --plan-only</code>；有图后写 HTML：<code>python3 _gen_ai_image_decks.py --html-only</code></p>",
    ]
    for mod, rows in sorted(by_mod.items()):
        blocks.append(f"<h2>{esc(mod)}</h2><ul>")
        for code, title, href, planned, have in rows:
            flag = f'<span class="ok">已生图 {have}/{planned}</span>' if have >= MIN_SLIDES else f'<span class="bad">生图中 {have}/{planned}</span>'
            blocks.append(f'<li><a href="{esc(href)}">{esc(code)} {esc(title)}</a> · {flag}</li>')
        blocks.append("</ul>")
    blocks.append("</body></html>")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text("\n".join(blocks), encoding="utf-8")


def process_one(md: Path, plan_only: bool, html_only: bool) -> tuple[str, str, str, int, int]:
    text = md.read_text(encoding="utf-8")
    meta = parse_meta(text)
    sections = split_h2(text)
    if not meta.get("课号"):
        # live sessions
        m = re.match(r"第(\d+)周", md.stem)
        meta.setdefault("课号", f"L{m.group(1)}" if m else md.stem[:8])
        meta.setdefault("课名", md.stem)

    lesson_dir = out_dir_for(md)
    slides_dir = lesson_dir / "slides"
    slides_dir.mkdir(parents=True, exist_ok=True)

    plan_path = lesson_dir / "prompts.json"
    if html_only and plan_path.exists():
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    else:
        plan = plan_slides(meta, sections)
        if len(plan) < MIN_SLIDES:
            raise RuntimeError(f"{md.name}: planned {len(plan)} < {MIN_SLIDES}")
        plan_path.write_text(json.dumps({"meta": meta, "slides": plan}, ensure_ascii=False, indent=2), encoding="utf-8")

    # normalize if loaded
    if isinstance(plan, dict):
        meta = plan.get("meta") or meta
        plan = plan["slides"]

    have = sum(1 for s in plan if (slides_dir / s["file"]).exists())
    if not plan_only:
        write_html(lesson_dir, meta, plan)

    rel = f"{lesson_dir.relative_to(OUT).as_posix()}/index.html"
    return meta.get("课号", ""), meta.get("课名", md.stem), rel, len(plan), have


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan-only", action="store_true")
    ap.add_argument("--html-only", action="store_true")
    ap.add_argument("--lesson", default="", help="课号过滤，如 0.1 或 3.4")
    args = ap.parse_args()

    items = []
    for md in lesson_paths():
        if args.lesson:
            text = md.read_text(encoding="utf-8", errors="ignore")
            meta = parse_meta(text)
            code = meta.get("课号", "")
            if args.lesson not in (code, md.stem) and not md.stem.startswith(args.lesson):
                continue
        items.append(process_one(md, args.plan_only, args.html_only))

    build_index(items)
    print(f"OK lessons={len(items)} out={OUT}")
    for code, title, rel, planned, have in items:
        print(f"  {code}\t{planned}页\t图{have}\t{rel}\t{title}")


if __name__ == "__main__":
    main()
