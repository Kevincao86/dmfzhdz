# -*- coding: utf-8 -*-
"""
从单课 md 的讲义内容，生成「图文课件」HTML（PPT 投屏用）。
不含演讲稿提词器；侧重卡片 / 流程 / 对照表等视觉结构。
"""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "html-讲义"

LESSON_GLOB = [
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
        meta[k] = v
    h1 = re.search(r"^#\s+(.+)$", text, re.M)
    if h1 and "课名" not in meta:
        meta["课名"] = h1.group(1).strip()
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


def split_h3_chunks(body: str) -> list[tuple[str, str]]:
    """Return [(h3_title or '', chunk_body), ...]"""
    body = re.sub(r"\n### 2\.1[\s\S]*?(?=\n## |\Z)", "\n", body)  # drop 备课加深
    # cut off if teleprompter leaked (shouldn't)
    body = re.split(r"\n## 3\.", body)[0]
    if "### " not in body:
        return [("", body.strip())]
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
        if not s or s.startswith("|") or s.startswith("#") or s.startswith("-") or s.startswith("*") or re.match(r"^\d+\.", s):
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


def bullet_to_card(item: str) -> dict:
    if "：" in item or ":" in item:
        sep = "：" if "：" in item else ":"
        a, b = item.split(sep, 1)
        return {"title": a.strip(), "body": b.strip()}
    if "**" in item:
        m = re.match(r"\*\*(.+?)\*\*[：:]?\s*(.*)", item)
        if m:
            return {"title": strip_md(m.group(1)), "body": strip_md(m.group(2))}
    return {"title": item[:18] + ("…" if len(item) > 18 else ""), "body": item}


# ---------- slide builders ----------

def slides_from_lesson(meta: dict, sections: dict[str, str]) -> list[dict]:
    code = meta.get("课号", "")
    title = meta.get("课名") or "课件"
    module = meta.get("所属模块", "")
    dur = meta.get("建议时长", "")
    gain = meta.get("学员收获", "")

    slides: list[dict] = []
    slides.append(
        {
            "type": "cover",
            "code": code,
            "title": title,
            "module": module,
            "dur": dur,
            "gain": gain,
        }
    )

    goals = find_sec(sections, "1.")
    if goals:
        gparas = extract_paras(goals)
        gbullets = extract_bullets(goals)
        slides.append(
            {
                "type": "goal",
                "title": "本课你将带走",
                "lead": gparas[0] if gparas else "",
                "items": gbullets or ([gain] if gain else gparas[1:4]),
            }
        )

    lecture = find_sec(sections, "2.")
    for h3, chunk in split_h3_chunks(lecture):
        table = parse_md_table(chunk)
        bullets = extract_bullets(chunk)
        paras = extract_paras(chunk)
        quotes = [strip_md(ln.lstrip("> ").strip()) for ln in chunk.split("\n") if ln.strip().startswith(">")]

        if table:
            header, rows = table
            slides.append(
                {
                    "type": "table",
                    "title": h3 or "要点对照",
                    "header": header,
                    "rows": rows,
                    "note": paras[0] if paras else "",
                }
            )
            continue

        if len(bullets) >= 3:
            cards = [bullet_to_card(b) for b in bullets[:6]]
            slides.append(
                {
                    "type": "cards",
                    "title": h3 or "核心要点",
                    "lead": paras[0] if paras and len(paras[0]) < 120 else "",
                    "cards": cards,
                }
            )
            # if many bullets, second slide
            if len(bullets) > 6:
                slides.append(
                    {
                        "type": "cards",
                        "title": (h3 or "核心要点") + "（续）",
                        "lead": "",
                        "cards": [bullet_to_card(b) for b in bullets[6:12]],
                    }
                )
            continue

        if len(bullets) == 2:
            slides.append(
                {
                    "type": "split",
                    "title": h3 or "对照理解",
                    "left": bullet_to_card(bullets[0]),
                    "right": bullet_to_card(bullets[1]),
                    "lead": paras[0] if paras else "",
                }
            )
            continue

        # process / numbered if looks like flow in paras
        if h3 and ("→" in h3 or "到" in h3) and ("→" in h3 or re.search(r"报名|反选|探店", h3)):
            steps = [s.strip() for s in re.split(r"→|－|—|>", h3) if s.strip()]
            if len(steps) >= 3:
                slides.append({"type": "flow", "title": h3, "steps": steps, "note": paras[0] if paras else ""})
                continue

        body_paras = paras[:4]
        if quotes:
            slides.append(
                {
                    "type": "takeaway",
                    "title": h3 or "记住这句话",
                    "quote": quotes[0],
                    "points": body_paras[:3] if body_paras else bullets[:3],
                }
            )
            continue

        if body_paras or bullets:
            slides.append(
                {
                    "type": "prose",
                    "title": h3 or "讲义要点",
                    "paras": body_paras or bullets[:4],
                }
            )

    # special: if lecture had a status table already handled; add flow for 状态机 lessons
    if "状态机" in title or "报名" in title and "回链" in title:
        # ensure a flow slide exists
        if not any(s.get("type") == "flow" for s in slides):
            slides.insert(
                2,
                {
                    "type": "flow",
                    "title": "履约五步状态机",
                    "steps": ["报名", "反选", "探店/拍摄", "审片", "回链"],
                    "note": "卡在哪一步，就只解决哪一步",
                },
            )

    demo = find_sec(sections, "4.")
    if demo:
        items = extract_bullets(demo) or extract_paras(demo)[:5]
        if items:
            slides.append({"type": "checklist", "title": "演示 / 操作路径", "items": items})

    tips = find_sec(sections, "5.")
    if tips:
        items = extract_bullets(tips) or extract_paras(tips)[:4]
        if items:
            slides.append({"type": "takeaway", "title": "口播与转化要点", "quote": items[0], "points": items[1:]})

    for k, v in sections.items():
        if "作业" in k or "验收" in k or "实操" in meta.get("课名", "") and k.startswith("1."):
            items = extract_bullets(v) or extract_paras(v)[:5]
            if items and "目标" not in k:
                slides.append({"type": "homework", "title": "作业 / 验收", "items": items})

    # closing
    slides.append(
        {
            "type": "end",
            "code": code,
            "title": title,
            "gain": gain or "把今天的要点落到测试店里点一遍",
        }
    )
    return slides


CSS = r"""
:root{
  --bg:#0c1222; --panel:#141e33; --card:#1c2a45; --line:rgba(148,163,184,.28);
  --text:#f1f5ff; --muted:#9fb0d0; --c1:#38bdf8; --c2:#34d399; --c3:#fbbf24; --c4:#f472b6; --c5:#a78bfa;
}
*{box-sizing:border-box} html,body{height:100%;margin:0}
body{
  font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  color:var(--text);
  background:
    radial-gradient(900px 480px at 0% 0%, #1d4ed855, transparent 55%),
    radial-gradient(700px 420px at 100% 10%, #0f766e40, transparent 50%),
    var(--bg);
  overflow:hidden;
}
.app{display:grid;grid-template-rows:auto 1fr auto;height:100vh}
.bar{
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:10px 18px;border-bottom:1px solid var(--line);background:rgba(8,12,22,.75);backdrop-filter:blur(8px);
}
.brand{font-size:13px;color:var(--muted)}.brand b{color:var(--c1)}
.btns{display:flex;gap:8px;align-items:center}
.btns button{
  border:1px solid var(--line);background:var(--card);color:var(--text);
  border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px
}
.btns button:hover{border-color:var(--c1)}
.pg{color:var(--muted);font-variant-numeric:tabular-nums;min-width:70px;text-align:right;font-size:13px}
.stage{display:flex;align-items:center;justify-content:center;padding:22px 28px}
.slide{
  display:none;width:min(1120px,100%);min-height:min(72vh,680px);
  background:linear-gradient(165deg,#1a2744 0%,var(--panel) 55%,#10192c 100%);
  border:1px solid var(--line);border-radius:24px;padding:42px 48px;
  box-shadow:0 30px 90px rgba(0,0,0,.4);
}
.slide.on{display:block;animation:in .25s ease}
@keyframes in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.k{color:var(--c1);font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:12px}
h1{font-size:clamp(30px,4.2vw,48px);line-height:1.18;margin:0 0 14px}
h2{font-size:clamp(24px,3vw,36px);margin:0 0 22px;line-height:1.25}
.sub{color:var(--muted);font-size:18px;line-height:1.55;margin:0 0 8px}
.gain{display:inline-block;margin-top:18px;padding:8px 14px;border-radius:999px;background:rgba(52,211,153,.12);color:var(--c2);font-size:14px}
.grid{display:grid;gap:14px;margin-top:8px}
.grid.cols-2{grid-template-columns:repeat(2,1fr)}
.grid.cols-3{grid-template-columns:repeat(3,1fr)}
.grid.cols-4{grid-template-columns:repeat(4,1fr)}
.grid.cols-5{grid-template-columns:repeat(5,1fr)}
.card{
  background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:16px;padding:18px 18px 16px;
  min-height:120px;
}
.card .t{font-size:17px;font-weight:700;margin-bottom:8px}
.card .b{font-size:15px;line-height:1.55;color:#d7e2f8}
.card:nth-child(5n+1){border-top:3px solid var(--c1)}
.card:nth-child(5n+2){border-top:3px solid var(--c2)}
.card:nth-child(5n+3){border-top:3px solid var(--c3)}
.card:nth-child(5n+4){border-top:3px solid var(--c4)}
.card:nth-child(5n+5){border-top:3px solid var(--c5)}
.flow{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch;margin:12px 0 8px}
.step{
  flex:1 1 120px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.35);
  border-radius:14px;padding:16px 12px;text-align:center;font-weight:700;font-size:16px;position:relative
}
.step small{display:block;margin-top:6px;font-weight:500;color:var(--muted);font-size:12px}
.arrow{align-self:center;color:var(--c1);font-size:22px;flex:0 0 auto}
table.deck{width:100%;border-collapse:collapse;margin-top:8px;font-size:15px}
table.deck th,table.deck td{border:1px solid var(--line);padding:12px 14px;text-align:left;vertical-align:top}
table.deck th{background:rgba(56,189,248,.12);color:#cfefff}
table.deck tr:nth-child(even) td{background:rgba(255,255,255,.03)}
.quote{
  margin:10px 0 18px;padding:18px 20px;border-radius:16px;
  background:linear-gradient(90deg,rgba(52,211,153,.14),rgba(56,189,248,.08));
  border-left:5px solid var(--c2);font-size:22px;line-height:1.55;font-weight:600
}
.plist{margin:0;padding-left:1.15em}
.plist li{font-size:18px;line-height:1.55;margin:0 0 12px;color:#e4ecff}
.check li::marker{content:"✓ ";color:var(--c2)}
.note{margin-top:16px;color:var(--c3);font-size:15px}
.foot{
  padding:8px 16px 12px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;
  display:flex;justify-content:space-between;background:rgba(8,12,22,.7)
}
kbd{background:#243149;border:1px solid var(--line);border-radius:6px;padding:1px 6px;color:var(--text)}
@media(max-width:860px){
  .stage{padding:10px}
  .slide{padding:22px 18px;border-radius:16px;min-height:60vh}
  .grid.cols-3,.grid.cols-4,.grid.cols-5{grid-template-columns:1fr 1fr}
  .quote{font-size:18px}
}
"""

JS = r"""
(function(){
  const slides=[...document.querySelectorAll('.slide')];
  const cur=document.getElementById('cur'), total=document.getElementById('total');
  total.textContent=String(slides.length);
  let i=0;
  function show(n){
    i=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach((s,idx)=>s.classList.toggle('on',idx===i));
    cur.textContent=String(i+1);
    history.replaceState(null,'','#'+(i+1));
  }
  document.getElementById('prev').onclick=()=>show(i-1);
  document.getElementById('next').onclick=()=>show(i+1);
  document.addEventListener('keydown',e=>{
    if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(i+1)}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(i-1)}
    else if(e.key==='Home')show(0);
    else if(e.key==='End')show(slides.length-1);
  });
  const h=parseInt((location.hash||'').replace('#',''),10);
  show(Number.isFinite(h)&&h>0?h-1:0);
})();
"""


def cols_class(n: int) -> str:
    if n <= 2:
        return "cols-2"
    if n == 3:
        return "cols-3"
    if n == 4:
        return "cols-4"
    return "cols-5"


def render_slide(s: dict, idx: int) -> str:
    t = s["type"]
    if t == "cover":
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">图文课件 · {esc(s.get('module') or '灵祺商家ERP')}</div>
  <h1>{esc(s.get('title',''))}</h1>
  <p class="sub">课号 {esc(s.get('code',''))}　｜　建议时长 {esc(s.get('dur') or '—')}</p>
  {f'<div class="gain">学员收获：{esc(s["gain"])}</div>' if s.get('gain') else ''}
</section>"""
    if t == "goal":
        items = s.get("items") or []
        cards = "".join(
            f'<div class="card"><div class="t">要点 {i+1}</div><div class="b">{esc(x)}</div></div>'
            for i, x in enumerate(items[:4])
        )
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">LEARNING GOAL</div>
  <h2>{esc(s['title'])}</h2>
  {f'<p class="sub">{esc(s["lead"])}</p>' if s.get('lead') else ''}
  <div class="grid {cols_class(max(len(items),1))}">{cards or '<div class="card"><div class="b">完成本课认知对齐</div></div>'}</div>
</section>"""
    if t == "cards":
        cards = s.get("cards") or []
        html_cards = "".join(
            f'<div class="card"><div class="t">{esc(c["title"])}</div><div class="b">{esc(c["body"])}</div></div>'
            for c in cards
        )
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">KEY POINTS</div>
  <h2>{esc(s['title'])}</h2>
  {f'<p class="sub">{esc(s["lead"])}</p>' if s.get('lead') else ''}
  <div class="grid {cols_class(len(cards) or 1)}">{html_cards}</div>
</section>"""
    if t == "split":
        L, R = s["left"], s["right"]
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">COMPARE</div>
  <h2>{esc(s['title'])}</h2>
  {f'<p class="sub">{esc(s["lead"])}</p>' if s.get('lead') else ''}
  <div class="grid cols-2">
    <div class="card"><div class="t">{esc(L['title'])}</div><div class="b">{esc(L['body'])}</div></div>
    <div class="card"><div class="t">{esc(R['title'])}</div><div class="b">{esc(R['body'])}</div></div>
  </div>
</section>"""
    if t == "flow":
        steps = s.get("steps") or []
        parts = []
        for i, st in enumerate(steps):
            if i:
                parts.append('<div class="arrow">→</div>')
            parts.append(f'<div class="step">{esc(st)}<small>STEP {i+1}</small></div>')
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">WORKFLOW</div>
  <h2>{esc(s['title'])}</h2>
  <div class="flow">{''.join(parts)}</div>
  {f'<p class="note">{esc(s["note"])}</p>' if s.get('note') else ''}
</section>"""
    if t == "table":
        th = "".join(f"<th>{esc(h)}</th>" for h in s.get("header") or [])
        trs = []
        for row in s.get("rows") or []:
            tds = "".join(f"<td>{esc(c)}</td>" for c in row)
            trs.append(f"<tr>{tds}</tr>")
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">FRAMEWORK</div>
  <h2>{esc(s['title'])}</h2>
  <table class="deck"><thead><tr>{th}</tr></thead><tbody>{''.join(trs)}</tbody></table>
  {f'<p class="note">{esc(s["note"])}</p>' if s.get('note') else ''}
</section>"""
    if t == "takeaway":
        pts = "".join(f"<li>{esc(p)}</li>" for p in (s.get("points") or [])[:5])
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">TAKEAWAY</div>
  <h2>{esc(s['title'])}</h2>
  <div class="quote">{esc(s.get('quote',''))}</div>
  {f'<ul class="plist">{pts}</ul>' if pts else ''}
</section>"""
    if t == "prose":
        paras = "".join(f"<li>{esc(p)}</li>" for p in (s.get("paras") or [])[:6])
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">INSIGHT</div>
  <h2>{esc(s['title'])}</h2>
  <ul class="plist">{paras}</ul>
</section>"""
    if t == "checklist":
        items = "".join(f"<li>{esc(x)}</li>" for x in (s.get("items") or [])[:8])
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">DEMO PATH</div>
  <h2>{esc(s['title'])}</h2>
  <ul class="plist check">{items}</ul>
</section>"""
    if t == "homework":
        items = "".join(f"<li>{esc(x)}</li>" for x in (s.get("items") or [])[:8])
        return f"""
<section class="slide" data-i="{idx}">
  <div class="k">HOMEWORK</div>
  <h2>{esc(s['title'])}</h2>
  <ul class="plist check">{items}</ul>
</section>"""
    # end
    return f"""
<section class="slide" data-i="{idx}">
  <div class="k">END · {esc(s.get('code',''))}</div>
  <h1>本课结束</h1>
  <p class="sub">{esc(s.get('title',''))}</p>
  <div class="gain">下一步：{esc(s.get('gain',''))}</div>
  <p class="note" style="margin-top:28px">灵祺AI智能ERP · 本地生活商家AI经营实操营</p>
</section>"""


def render_html(meta: dict, slides: list[dict], src: str) -> str:
    code = meta.get("课号", "")
    title = meta.get("课名") or "课件"
    body = "\n".join(render_slide(s, i) for i, s in enumerate(slides))
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{esc(code)} {esc(title)} · 图文课件</title>
<style>{CSS}</style>
</head>
<body>
<div class="app">
  <div class="bar">
    <div class="brand"><b>图文课件</b> · {esc(code)} {esc(title)}</div>
    <div class="btns">
      <button type="button" id="prev">← 上一页</button>
      <button type="button" id="next">下一页 →</button>
      <div class="pg"><span id="cur">1</span>/<span id="total">1</span></div>
    </div>
  </div>
  <div class="stage">{body}</div>
  <div class="foot">
    <div><kbd>←</kbd> <kbd>→</kbd> / <kbd>空格</kbd> 翻页 · 源文件 {esc(src)}</div>
    <div>投屏讲解用 · 非提词器</div>
  </div>
</div>
<script>{JS}</script>
</body>
</html>
"""


def process(md: Path) -> Path | None:
    if md.name.startswith("00-"):
        return None
    text = md.read_text(encoding="utf-8")
    meta = parse_meta(text)
    if not meta.get("课名"):
        return None
    sections = split_h2(text)
    slides = slides_from_lesson(meta, sections)
    # enrich: AI teaching synthesis — if too few content slides, expand from goals+gain
    content_n = sum(1 for s in slides if s["type"] not in ("cover", "end", "goal"))
    if content_n < 2:
        gain = meta.get("学员收获", "")
        slides.insert(
            2,
            {
                "type": "cards",
                "title": "本课结构",
                "lead": "按「懂 → 会看 → 会做」推进",
                "cards": [
                    {"title": "懂", "body": extract_paras(find_sec(sections, "1."))[:1] and extract_paras(find_sec(sections, "1."))[0] or "对齐本课目标"},
                    {"title": "会看", "body": gain or "能指认关键入口与状态"},
                    {"title": "会做", "body": "按演示清单在测试店点一遍"},
                ],
            },
        )

    rel_src = md.relative_to(ROOT).as_posix()
    out_dir = OUT / md.parent.relative_to(ROOT)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{md.stem}.html"
    out.write_text(render_html(meta, slides, rel_src), encoding="utf-8")
    return out


def build_index(items: list[tuple[str, str, str]]) -> None:
    by: dict[str, list] = {}
    for code, title, rel in items:
        by.setdefault(rel.split("/")[0], []).append((code, title, rel))
    chunks = []
    for mod, rows in sorted(by.items()):
        chunks.append(f"<h2>{esc(mod)}</h2><ul>")
        for code, title, rel in rows:
            chunks.append(f'<li><a href="{esc(rel)}"><b>{esc(code)}</b> {esc(title)}</a></li>')
        chunks.append("</ul>")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.html").write_text(
        f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>商家ERP月订阅 · 图文课件目录</title>
<style>
body{{margin:0;font-family:"PingFang SC","Microsoft YaHei",sans-serif;background:#0c1222;color:#f1f5ff}}
main{{max-width:900px;margin:0 auto;padding:36px 20px 72px}}
h1{{font-size:28px}} h2{{color:#38bdf8;font-size:18px;margin-top:28px}}
a{{color:#7dd3fc;text-decoration:none}} a:hover{{text-decoration:underline}}
.tip{{color:#9fb0d0;line-height:1.6}} ul{{line-height:2}}
</style></head><body><main>
<h1>本地生活商家AI经营实操营 · 图文课件</h1>
<p class="tip">每课为投屏用 PPT 式图文页（卡片 / 流程 / 对照表）。← → 翻页。不含演讲提词器。</p>
{''.join(chunks)}
</main></body></html>""",
        encoding="utf-8",
    )
    (OUT / "使用说明.md").write_text(
        """# 图文课件使用说明

- 打开 `index.html` 选课，或直接打开单课 HTML。
- 键盘 `←` `→` / 空格翻页，适合投屏讲解。
- 内容来自各课「讲义」结构化排版（目标、要点卡片、流程、表格、演示路径、作业），**不是**逐秒演讲稿。
- 更新课件 md 后，在上级目录执行：`python3 _gen_html_decks.py`
""",
        encoding="utf-8",
    )


def main() -> None:
    files: list[Path] = []
    for pat in LESSON_GLOB:
        files.extend(ROOT.glob(pat))
    seen: set[Path] = set()
    items: list[tuple[str, str, str]] = []
    for f in sorted(files, key=lambda p: p.as_posix()):
        if f.resolve() in seen:
            continue
        seen.add(f.resolve())
        out = process(f)
        if not out:
            continue
        meta = parse_meta(f.read_text(encoding="utf-8"))
        code = meta.get("课号") or f.stem.split("-")[0]
        title = meta.get("课名") or f.stem
        items.append((code, title, out.relative_to(OUT).as_posix()))
        print("OK", out.relative_to(ROOT))
    build_index(items)
    print(f"\nDone: {len(items)} 图文课件 → {OUT}/index.html")


if __name__ == "__main__":
    main()
