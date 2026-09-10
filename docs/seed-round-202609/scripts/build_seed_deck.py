#!/usr/bin/env python3
"""Build LingQi seed-round 16:9 pitch deck (PPTX + PDF + PNG)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont
from pptx import Presentation
from pptx.util import Inches

W, H = 1920, 1080
INK = (18, 20, 22)
NAVY = (11, 24, 38)
CREAM = (246, 241, 232)
MUTED = (90, 88, 82)
LINE = (210, 202, 188)
RUST = (196, 92, 38)
TEAL = (36, 92, 78)
GOLD = (184, 150, 96)
WHITE = (255, 255, 255)

ROOT = Path(__file__).resolve().parents[1]
ASSETS_AI = ROOT / "images"
ASSETS_FALLBACK = Path(
    "/Users/damowang/.cursor/projects/Volumes-OS-Users-damowangOS-AI-ERP/assets"
)
OUT = ROOT / "slides"
DESK = Path.home() / "Desktop" / "灵祺种子轮投融资资料-20260906" / "路演PPT"

FONT_TITLE = "/System/Library/Fonts/Supplemental/Songti.ttc"
FONT_BODY_M = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_BODY_L = "/System/Library/Fonts/STHeiti Light.ttc"
FONT_SANS = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def font(path: str, size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size, index=index)


def f_title(size: int) -> ImageFont.FreeTypeFont:
    return font(FONT_TITLE, size, 1)


def f_body(size: int, light: bool = False) -> ImageFont.FreeTypeFont:
    return font(FONT_BODY_L if light else FONT_BODY_M, size, 1)


def f_sans(size: int) -> ImageFont.FreeTypeFont:
    return font(FONT_SANS, size, 0)


def new_slide(color=CREAM) -> Image.Image:
    return Image.new("RGB", (W, H), color)


def s(*vals):
    """Scale logical 1920×1080 coords to 2× for sharper slides 11–13."""
    if len(vals) == 1:
        v = vals[0]
        if isinstance(v, (tuple, list)):
            return tuple(int(x * 2) for x in v)
        return int(v * 2)
    return tuple(int(v * 2) for v in vals)


def new_slide_hi(color=CREAM) -> Image.Image:
    return Image.new("RGB", (W * 2, H * 2), color)


def load_cover(name: str) -> Image.Image:
    src = ASSETS_AI / name
    if not src.exists():
        src = ASSETS_FALLBACK / name
    img = Image.open(src).convert("RGB")
    img = img.resize((W, H), Image.Resampling.LANCZOS)
    return img


def darken(img: Image.Image, factor: float = 0.42) -> Image.Image:
    return ImageEnhance.Brightness(img).enhance(factor)


def overlay(base: Image.Image, color=(8, 14, 22), alpha: int = 120) -> Image.Image:
    layer = Image.new("RGBA", base.size, color + (alpha,))
    out = base.convert("RGBA")
    out = Image.alpha_composite(out, layer)
    return out.convert("RGB")


def text(
    draw: ImageDraw.ImageDraw,
    xy,
    s: str,
    fn,
    fill=INK,
    anchor: str = "lt",
):
    draw.text(xy, s, font=fn, fill=fill, anchor=anchor)


def wrap_draw(draw, xy, s, fn, fill, max_w, leading=None, anchor="lt"):
    words = list(s)
    # wrap by pixel width for CJK
    lines, cur = [], ""
    for ch in words:
        trial = cur + ch
        if draw.textlength(trial, font=fn) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    x, y = xy
    lh = leading or int(fn.size * 1.45)
    for i, line in enumerate(lines):
        draw.text((x, y + i * lh), line, font=fn, fill=fill, anchor=anchor)
    return len(lines) * lh


def footer(draw, page: int, total: int = 13, light: bool = False, scale: int = 1):
    c = (210, 210, 210) if light else MUTED
    text(draw, (80 * scale, 1036 * scale), "灵祺 · 种子轮  保密", f_body(18 * scale, True), c)
    text(
        draw,
        (1840 * scale, 1036 * scale),
        f"{page:02d} / {total:02d}",
        f_body(18 * scale, True),
        c,
        "rt",
    )


def card(draw, box, fill=WHITE, outline=LINE, r=18, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def kpi(draw, box, value, label, sub=""):
    card(draw, box)
    x0, y0, x1, y1 = box
    text(draw, (x0 + 28, y0 + 28), value, f_title(44), RUST)
    text(draw, (x0 + 28, y0 + 86), label, f_body(22), INK)
    if sub:
        text(draw, (x0 + 28, y0 + 124), sub, f_body(16, True), MUTED)


def save(img: Image.Image, name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    img.save(path, "PNG", optimize=True)
    return path


def paste_rounded(base: Image.Image, photo: Path, box, radius: int = 22) -> None:
    x0, y0, x1, y1 = box
    tw, th = x1 - x0, y1 - y0
    im = Image.open(photo).convert("RGB")
    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = max(1, int(sw * scale)), max(1, int(sh * scale))
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, (nw - tw) // 2)
    top = max(0, (nh - th) // 6)  # bias toward face
    im = im.crop((left, top, left + tw, top + th))
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw - 1, th - 1), radius=radius, fill=255)
    base.paste(im, (x0, y0), mask)


def slide_01():
    img = overlay(darken(load_cover("lingqi-seed-cover.png"), 0.38), alpha=90)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 14, H), fill=RUST)
    text(d, (80, 86), "种子轮  ·  2026.09", f_sans(20), GOLD)
    text(d, (80, 280), "灵祺", f_title(118), WHITE)
    text(d, (80, 430), "商家 ERP", f_title(46), CREAM)
    text(d, (80, 500), "加上星选达人平台", f_title(46), CREAM)
    d.rectangle((80, 572, 220, 576), fill=RUST)
    text(
        d,
        (80, 610),
        "公司在宁波  ·  达人主要在温州  ·  下一步杭州",
        f_body(26, True),
        (220, 214, 204),
    )
    text(d, (80, 850), "种子轮  人民币 400 万元", f_body(28), WHITE)
    text(
        d,
        (80, 896),
        "宁波墨典网络科技有限公司  ·  曹鑫淼  15757468650",
        f_body(20, True),
        (200, 196, 188),
    )
    text(
        d,
        (80, 932),
        "modian@mofangdianai.com",
        f_body(20, True),
        (200, 196, 188),
    )
    text(d, (1840, 910), "数字截至 2026-09-06，从服务器拉的", f_body(18, True), (180, 176, 168), "rt")
    return img


def slide_02():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "01  /  我们做什么", f_sans(18), RUST)
    text(d, (80, 108), "门店不缺平台，缺的是把事做完", f_title(46), INK)
    wrap_draw(
        d,
        (80, 180),
        "我天天见老板被抖音、美团推着拍短视频、找达人。真正干活还是微信群和表格：组品不会写，达人对不上号，结账靠截图。所以我把商家后台和达人端做成一套。",
        f_body(24, True),
        MUTED,
        1760,
    )
    boxes = [
        (80, 340, 620, 720, "商家侧", "商家 / 服务商 ERP", "组品 · 方案 · 店铺分析\n短视频 · 投流 · 确认后才写入"),
        (660, 340, 1260, 720, "打通", "同一套系统", "商家发单，达人端能看见\n交了活能回到后台"),
        (1300, 340, 1840, 720, "达人侧", "星选达人平台", "招募 · 报名 · 探店 / 云剪\n回传核实 · 结算"),
    ]
    for x0, y0, x1, y1, k, t, b in boxes:
        card(d, (x0, y0, x1, y1), fill=WHITE)
        d.rectangle((x0, y0, x0 + 8, y1), fill=RUST if k != "打通" else TEAL)
        text(d, (x0 + 36, y0 + 36), k, f_sans(16), RUST)
        text(d, (x0 + 36, y0 + 78), t, f_title(30), INK)
        yy = y0 + 160
        for line in b.split("\n"):
            text(d, (x0 + 36, yy), line, f_body(22, True), MUTED)
            yy += 40
    text(
        d,
        (80, 800),
        "系统已经在跑，两边都有真人在用。收费还薄，先把宁波、温州、杭州做扎实。",
        f_body(24),
        INK,
    )
    text(
        d,
        (80, 860),
        "400 万不是再堆功能，是把现在在用的人收成费。",
        f_body(24, True),
        MUTED,
    )
    footer(d, 2)
    return img


def slide_03():
    photo = load_cover("lingqi-seed-problem.png")
    photo = photo.resize((820, 1080), Image.Resampling.LANCZOS)
    photo = photo.filter(ImageFilter.GaussianBlur(0.3))
    img = new_slide()
    img.paste(photo, (0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((820, 0, W, H), fill=CREAM)
    text(d, (880, 72), "02  /  痛点", f_sans(18), RUST)
    text(d, (880, 118), "这四件事，现在还停在群和表", f_title(40), INK)
    pains = [
        ("组品不会写", "组品、方案、评价散在好几个后台，只能听代运营口头讲"),
        ("达人对不上", "微信群和私聊没有统一状态，排期对账靠人盯"),
        ("结账靠截图", "截图和口头确认，一结账就扯皮"),
        ("代运营带不动", "一个服务商管多家店，只能靠表格来回切客户"),
    ]
    y = 220
    for i, (t, b) in enumerate(pains, 1):
        card(d, (880, y, 1840, y + 150))
        text(d, (910, y + 28), f"0{i}", f_sans(18), GOLD)
        text(d, (980, y + 24), t, f_title(28), INK)
        wrap_draw(d, (980, y + 72), b, f_body(20, True), MUTED, 820)
        y += 168
    footer(d, 3)
    return img


def slide_04():
    img = overlay(darken(load_cover("lingqi-seed-dual-engine.png"), 0.34), alpha=100)
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "03  /  解决方案", f_sans(18), GOLD)
    text(d, (80, 108), "一边经营，一边找达人", f_title(48), WHITE)
    text(
        d,
        (80, 180),
        "老板确认过，系统才改数据。达人交了活，能回到后台。不是只发一张招募就结束。",
        f_body(22, True),
        (220, 214, 204),
    )
    left = [
        ("商家 ERP", "组品、方案、店铺分析，说话就能出稿"),
        ("确认后再写入", "改错了老板自己看得见，自己点确认"),
        ("多平台一起用", "来客、美团、小红书都能接，不碰平台收款"),
    ]
    right = [
        ("星选四个身份", "达人 · PR · 拍摄 · 剪辑"),
        ("探店 + 云剪", "报名、反选、交货、回传、结算"),
        ("两边同一套数", "商家后台发的单，星选里就能报"),
    ]
    for i, (t, b) in enumerate(left):
        y = 280 + i * 200
        card(d, (80, y, 900, y + 170), fill=(12, 22, 34), outline=(50, 62, 74))
        text(d, (110, y + 36), t, f_title(26), CREAM)
        text(d, (110, y + 90), b, f_body(20, True), (190, 186, 178))
    for i, (t, b) in enumerate(right):
        y = 280 + i * 200
        card(d, (1020, y, 1840, y + 170), fill=(12, 22, 34), outline=(50, 62, 74))
        text(d, (1050, y + 36), t, f_title(26), CREAM)
        text(d, (1050, y + 90), b, f_body(20, True), (190, 186, 178))
    footer(d, 4, light=True)
    return img


def slide_05():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "04  /  产品", f_sans(18), RUST)
    text(d, (80, 108), "四个入口都在线上，我可以当场打开", f_title(40), INK)
    rows = [
        ("商家 ERP", "cs.mofangdianai.com", "商户", "组品 / 发招募 / 短视频 / 店铺分析"),
        ("服务商 ERP", "fws.mofangdianai.com", "代运营", "一家服务商带多家店"),
        ("星选平台", "dr.mofangdianai.com · 微信搜灵祺星选", "达人 / PR / 团队", "大厅、急单、云剪、私信、积分"),
        ("线上系统", "已连续跑 100 天", "整条链路", "登录、大厅、支付都已经通"),
    ]
    y = 210
    headers = ["产品", "入口", "用户", "已交付能力"]
    xs = [80, 360, 860, 1120]
    for x, h in zip(xs, headers):
        text(d, (x, y), h, f_sans(16), MUTED)
    y = 250
    d.line((80, y, 1840, y), fill=LINE, width=1)
    y = 280
    for name, url, user, cap in rows:
        card(d, (80, y, 1840, y + 140))
        text(d, (110, y + 48), name, f_title(26), INK)
        text(d, (360, y + 54), url, f_body(20, True), MUTED)
        text(d, (860, y + 54), user, f_body(20), TEAL)
        wrap_draw(d, (1120, y + 48), cap, f_body(20, True), INK, 680)
        y += 160
    text(
        d,
        (80, 960),
        "软著：灵祺 AI 智能 ERP 商家管理系统 V1.0  ·  灵祺达人招募小程序软件 V1.0",
        f_body(18, True),
        MUTED,
    )
    footer(d, 5)
    return img


def slide_06():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "05  /  生产用量", f_sans(18), RUST)
    text(d, (80, 108), "这些数是 9 月 6 日从服务器拉的", f_title(40), INK)
    items = [
        (80, 210, 520, 430, "737", "星选会员档案", "小程序账号 793"),
        (540, 210, 980, 430, "293", "招募单", "累计报名 1,979"),
        (1000, 210, 1440, 430, "527", "运营达人库", "中位粉丝 2.2 万"),
        (1460, 210, 1840, 430, "38", "PR", "拍摄 46 · 剪辑 22"),
        (80, 460, 520, 680, "32", "ERP 客户", "其中具名经营主体约 14 家"),
        (540, 460, 980, 680, "59,643", "同步平台订单", "3 家深度店 · 107 个门店"),
        (1000, 460, 1440, 680, "733万", "平台成交", "商户成交，不是灵祺收入"),
        (1460, 460, 1840, 680, "6,397", "AI 调用", "7 月高峰 4,286 次"),
    ]
    for box in items:
        kpi(d, box[:4], box[4], box[5], box[6])
    card(d, (80, 720, 1840, 980), fill=(36, 28, 22), outline=(36, 28, 22))
    text(d, (110, 760), "见面我先讲这四个数", f_sans(18), GOLD)
    text(
        d,
        (110, 810),
        "737 会员   ·   293 单 / 1,979 报名   ·   59,643 平台订单   ·   确认收款约 0.29 万",
        f_title(28),
        CREAM,
    )
    text(
        d,
        (110, 880),
        "733 万是这三家店在抖音上的成交，不是灵祺赚的。我们自己确认到账大约 0.29 万。",
        f_body(20, True),
        (210, 200, 188),
    )
    footer(d, 6)
    return img


def slide_07():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "06  /  数据口径", f_sans(18), RUST)
    text(d, (80, 108), "哪些在用，哪些已经付钱，分开说", f_title(40), INK)
    card(d, (80, 210, 920, 980))
    text(d, (110, 240), "32 个 ERP 客户构成", f_title(26), INK)
    rows = [
        ("具名经营 / 服务商", "14", "小七咖啡、德悦、阿毛饭店、塔塔、极道等"),
        ("微信快捷注册", "13", "店名尚未完善，仍待激活"),
        ("测试 / 停用", "5", "内部测试账号"),
        ("服务商版", "5", "塔塔、极道、杭州意米、意米文化等"),
        ("深度用数", "3", "已同步 59,643 单抖音来客订单"),
        ("确认收款", "¥2,897", "通道已通：微信 / 支付宝 / 抖音"),
    ]
    y = 310
    for a, b, c in rows:
        text(d, (110, y), a, f_body(20), INK)
        text(d, (430, y), b, f_title(22), RUST)
        text(d, (540, y), c, f_body(18, True), MUTED)
        y += 88
    card(d, (960, 210, 1840, 980))
    text(d, (990, 240), "已接入平台订单的 3 家商户", f_title(26), INK)
    shops = [
        ("塔塔（服务商）", "36,470 单", "73 个门店", "成交 267 万"),
        ("极道（服务商）", "16,434 单", "12 个门店", "成交 370 万"),
        ("XJC 徽农商地锅鸡", "6,739 单", "24 个门店", "成交 96 万 · 已付 598"),
    ]
    y = 330
    for name, a, b, c in shops:
        card(d, (990, y, 1810, y + 170), fill=CREAM, outline=LINE)
        text(d, (1020, y + 28), name, f_title(24), INK)
        text(d, (1020, y + 84), f"{a}   ·   {b}   ·   {c}", f_body(20, True), MUTED)
        y += 190
    text(d, (990, 900), "会员档位开了 14 户，多数是我们送的积分，还没形成月月进账。", f_body(18, True), MUTED)
    footer(d, 7)
    return img


def slide_08():
    photo = load_cover("lingqi-seed-talent.png")
    photo = photo.resize((820, 1080), Image.Resampling.LANCZOS)
    img = new_slide()
    img.paste(photo, (1100, 0))
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "07  /  供给侧", f_sans(18), RUST)
    text(d, (80, 108), "温州这一座城，达人已经能看见", f_title(40), INK)
    stats = [
        ("264", "温州会员"),
        ("424", "浙江会员"),
        ("170", "≥10 万粉达人"),
        ("2.2万", "达人库中位粉丝"),
    ]
    x = 80
    for v, l in stats:
        card(d, (x, 220, x + 230, 380))
        text(d, (x + 20, 248), v, f_title(34), RUST)
        text(d, (x + 20, 310), l, f_body(18, True), MUTED)
        x += 250
    text(d, (80, 430), "会员注册节奏", f_title(26), INK)
    months = [("6 月", 386), ("7 月", 267), ("8 月", 75), ("9 月截至6日", 9)]
    maxv = 386
    y0, h0 = 500, 220
    x = 80
    for name, v in months:
        bh = int(h0 * v / maxv) if v else 8
        d.rectangle((x, y0 + h0 - bh, x + 160, y0 + h0), fill=TEAL)
        text(d, (x + 80, y0 + h0 - bh - 16), str(v), f_body(18), INK, "ms")
        text(d, (x + 80, y0 + h0 + 28), name, f_body(18, True), MUTED, "ms")
        x += 220
    text(
        d,
        (80, 800),
        "夏天加人快。8 月起我主动放慢，先把供给做扎实。这笔钱不会拿去全国买人。",
        f_body(22, True),
        MUTED,
    )
    text(
        d,
        (80, 860),
        "大厅里大约一半招募单有人报，最多一张单 85 人。现在多半还是 PR 代发，商家自己发刚开始。",
        f_body(22, True),
        MUTED,
    )
    footer(d, 8)
    return img


def slide_09():
    img = overlay(darken(load_cover("lingqi-seed-cities.png"), 0.36), alpha=95)
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "08  /  市场与城市", f_sans(18), GOLD)
    text(d, (80, 108), "杭甬温先吃透，下一城再说", f_title(42), WHITE)
    facts = [
        ("13.7 万亿", "本地商家服务业规模（公开数字）"),
        ("691 亿", "餐饮线上运营解决方案 2024"),
        ("大约 3%", "前五名加起来的份额，还很散"),
        ("0.8–1.5 万", "杭甬温里有种草预算的门店"),
    ]
    x = 80
    for v, l in facts:
        card(d, (x, 240, x + 420, 430), fill=(12, 22, 34), outline=(55, 66, 78))
        text(d, (x + 28, 270), v, f_title(32), GOLD)
        wrap_draw(d, (x + 28, 340), l, f_body(18, True), (210, 204, 196), 360)
        x += 450
    cities = [
        ("宁波", "我在这里试店，地推跑得动"),
        ("温州", "老板肯付钱，达人已经有 264 人"),
        ("杭州", "品牌、人和后面融资，都在这里"),
    ]
    y = 500
    for t, b in cities:
        card(d, (80, y, 1840, y + 130), fill=(12, 22, 34), outline=(55, 66, 78))
        text(d, (120, y + 44), t, f_title(30), CREAM)
        text(d, (320, y + 52), b, f_body(22, True), (210, 204, 196))
        y += 150
    footer(d, 9, light=True)
    return img


def slide_10():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "09  /  模式与资金", f_sans(18), RUST)
    text(d, (80, 108), "收费口已经开了，进账还很少", f_title(36), INK)
    models = [
        ("商家订阅", "约 ¥168 / 月", "支付页已经有 168 这一档"),
        ("履约 / 撮合", "¥10–50 / 单", "大厅里已经有单的预算"),
        ("达人 / PR 会员", "约 ¥9.9 / 月", "积分月赠在跑，充值几乎为 0"),
        ("服务商席位", "1.98–4.98 万 / 年", "5 家服务商，合同还没转付费"),
        ("模型和云剪", "按用量加价", "7 月 4,286 次调用可以报价"),
    ]
    y = 200
    for a, b, c in models:
        card(d, (80, y, 980, y + 120))
        text(d, (110, y + 40), a, f_title(24), INK)
        text(d, (430, y + 44), b, f_body(22), RUST)
        text(d, (680, y + 46), c, f_body(18, True), MUTED)
        y += 136
    text(d, (1060, 200), "400 万用途", f_title(28), INK)
    funds = [
        ("商业化与渠道", "160 万", "40%", RUST),
        ("交付与达人供给", "100 万", "25%", TEAL),
        ("研发与云资源", "100 万", "25%", GOLD),
        ("储备与合规", "40 万", "10%", (90, 88, 82)),
    ]
    y = 270
    for name, amt, pct, color in funds:
        card(d, (1060, y, 1840, y + 140))
        d.rectangle((1060, y, 1074, y + 140), fill=color)
        text(d, (1100, y + 32), name, f_title(24), INK)
        text(d, (1100, y + 80), f"{amt}   ·   {pct}", f_body(20, True), MUTED)
        y += 160
    footer(d, 10)
    return img


def slide_11():
    img = new_slide_hi()
    d = ImageDraw.Draw(img)
    text(d, s(80, 64), "10  /  竞争与里程碑", f_sans(s(18)), RUST)
    text(d, s(80, 108), "我不跟谁抢，接下来一年怎么走", f_title(s(42)), INK)
    comps = [
        ("再惠", "高客单全栈代运营", "我们做低价自助，先吃透一座城"),
        ("有赞", "经营系统加种草", "我们自己有达人端，交了活能回传"),
        ("只发招募的工具", "只抢营销预算", "我们连经营一起做，不只发单"),
        ("来客 / 美团", "自家后台越来越好用", "我们多平台一起接，不碰他们的钱"),
    ]
    x = 80
    for a, b, c in comps:
        card(d, s(x, 200, x + 420, 430), r=s(18), width=2)
        text(d, s(x + 24, 228), a, f_title(s(26)), INK)
        wrap_draw(d, s(x + 24, 286), b, f_body(s(18), True), MUTED, s(360))
        wrap_draw(d, s(x + 24, 350), c, f_body(s(18)), TEAL, s(360))
        x += 450
    text(d, s(80, 480), "我给自己定的数", f_title(s(26)), INK)
    miles = [
        ("现在", "具名约 14 · 深用 3", "以服务器上的数为准"),
        ("3 个月", "付费 30–60", "先做出 3 个能对账的店"),
        ("6 个月", "150–300", "至少 3 家服务商开始带客付钱"),
        ("12 个月", "800–1,500", "客单价和留存能拿出来讲"),
    ]
    x = 80
    for t, a, b in miles:
        card(d, s(x, 540, x + 420, 860), r=s(18), width=2)
        text(d, s(x + 28, 572), t, f_sans(s(18)), RUST)
        text(d, s(x + 28, 620), a, f_title(s(26)), INK)
        wrap_draw(d, s(x + 28, 700), b, f_body(s(20), True), MUTED, s(350))
        x += 450
    text(
        d,
        s(80, 910),
        "这些是我给自己卡的节点。做不到就改，不拿明年故事换今天的钱。",
        f_body(s(20), True),
        MUTED,
    )
    footer(d, 11, scale=2)
    return img


def slide_12():
    img = new_slide_hi()
    d = ImageDraw.Draw(img)
    text(d, s(80, 40), "11  /  我们是谁", f_sans(s(18)), RUST)
    text(d, s(80, 76), "一个把系统做出来，一个把生意谈进来", f_title(s(36)), INK)
    text(
        d,
        s(80, 132),
        "兼职还有三个人。后端、算法、产品都在岗上。",
        f_body(s(20), True),
        MUTED,
    )
    people = [
        {
            "photo": ROOT / "images" / "founder-cao.png",
            "box": s(80, 176, 920, 620),
            "pic": s(104, 200, 400, 596),
            "name": "曹鑫淼",
            "role": "项目带头人  ·  技术和产品",
            "lines": [
                "浙江农林大学 本科",
                "2019–2023  阿里巴巴本地生活",
                "宁波区域负责人",
                "2023–2026  字节跳动本地生活",
                "大客户负责人",
            ],
        },
        {
            "photo": ROOT / "images" / "founder-xie.png",
            "box": s(1000, 176, 1840, 620),
            "pic": s(1024, 200, 1320, 596),
            "name": "谢锦超",
            "role": "合伙人  ·  销售和市场",
            "lines": [
                "西安培华学院",
                "2019–2025  小米生态",
                "温州区域负责人",
                "现在把门店和服务商谈进来",
            ],
        },
    ]
    for p in people:
        card(d, p["box"], r=s(18), width=2)
        paste_rounded(img, p["photo"], p["pic"], radius=s(16))
        tx = p["pic"][2] + s(28)
        ty = s(214)
        text(d, (tx, ty), p["name"], f_title(s(30)), INK)
        text(d, (tx, ty + s(48)), p["role"], f_body(s(18)), RUST)
        yy = ty + s(110)
        for line in p["lines"]:
            text(d, (tx, yy), line, f_body(s(18), True), MUTED)
            yy += s(40)
    text(d, s(80, 648), "兼职一起做", f_title(s(22)), INK)
    mates = [
        (
            "胡可敌",
            "兼职  ·  后端",
            ["2019–2022  飞猪网页后端", "2022–2026  阿里巴巴淘宝后端"],
        ),
        (
            "马强",
            "兼职  ·  算法",
            ["原商汤  高级算法策略工程师", "现在百度  算法策略工程师"],
        ),
        (
            "朱晓晨",
            "兼职  ·  产品",
            ["原字节跳动  南部大区抖音产品负责人", "现在百度  产品开发经理"],
        ),
    ]
    x = 80
    for name, role, lines in mates:
        card(d, s(x, 692, x + 560, 1000), r=s(16), width=2)
        text(d, s(x + 28, 720), name, f_title(s(26)), INK)
        text(d, s(x + 28, 770), role, f_body(s(18)), RUST)
        yy = 824
        for line in lines:
            text(d, s(x + 28, yy), line, f_body(s(18), True), MUTED)
            yy += 40
        x += 580
    footer(d, 12, scale=2)
    return img


def slide_13():
    img = new_slide_hi()
    d = ImageDraw.Draw(img)
    text(d, s(80, 64), "12  /  300 万怎么花", f_sans(s(18)), RUST)
    text(d, s(80, 108), "先到账的 300 万，我准备这么花", f_title(s(40)), INK)
    text(
        d,
        s(80, 176),
        "整轮目标 400 万，顶到 500 万。希望一家领投，一两家跟投。",
        f_body(s(22), True),
        MUTED,
    )
    uses = [
        (
            "120 万",
            "商务和渠道",
            RUST,
            "地推走宁波、温州、杭州；服务商走已经在谈的 5 家，合同改成付费带客；存量走 13 家微信注册店，做成能付钱的门店。",
        ),
        (
            "75 万",
            "达人和交付",
            TEAL,
            "供给走温州：264 个会员做成能接单交货。客成、履约、结算这条链要跑通，不然商家订了也交不出去。",
        ),
        (
            "75 万",
            "系统和云",
            GOLD,
            "钱留给四端和 212 条接口稳住，以及模型、存储、云剪按用量付。这轮不拿去重做产品。",
        ),
        (
            "30 万",
            "备用",
            MUTED,
            "支付通道、内容审核、应急。按 18 个月的盘子留着，不拿去铺新城市。",
        ),
    ]
    y = 240
    for amt, name, color, channel in uses:
        card(d, s(80, y, 1840, y + 132), r=s(16), width=2)
        d.rectangle(s(80, y, 94, y + 132), fill=color)
        text(d, s(130, y + 28), amt, f_title(s(28)), RUST)
        text(d, s(130, y + 78), name, f_body(s(20)), INK)
        wrap_draw(d, s(420, y + 36), channel, f_body(s(22), True), MUTED, s(1360))
        y += 148
    card(d, s(80, 832, 1840, 1008), r=s(16), width=2)
    text(d, s(110, 856), "宁波墨典网络科技有限公司", f_title(s(24)), INK)
    text(d, s(110, 902), "创始人  曹鑫淼  ·  技术和产品　　合伙人  谢锦超  ·  销售和市场", f_body(s(20)), MUTED)
    text(d, s(110, 942), "手机 / 微信  15757468650　　邮箱  modian@mofangdianai.com", f_body(s(20), True), MUTED)
    text(
        d,
        s(110, 978),
        "商家 ERP  cs.mofangdianai.com　　星选  dr.mofangdianai.com  ·  微信搜「灵祺星选」",
        f_body(s(18), True),
        MUTED,
    )
    footer(d, 13, scale=2)
    return img


def build_pptx(pngs: list[Path], dest: Path) -> None:
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]
    for p in pngs:
        slide = prs.slides.add_slide(blank)
        slide.shapes.add_picture(str(p), Inches(0), Inches(0), Inches(13.333), Inches(7.5))
    prs.save(dest)


def build_pdf(pngs: list[Path], dest: Path) -> None:
    pages = []
    for p in pngs:
        im = Image.open(p).convert("RGB")
        if im.size != (W, H):
            im = im.resize((W, H), Image.Resampling.LANCZOS)
        pages.append(im)
    pages[0].save(dest, save_all=True, append_images=pages[1:], resolution=150)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    builders = [
        slide_01,
        slide_02,
        slide_03,
        slide_04,
        slide_05,
        slide_06,
        slide_07,
        slide_08,
        slide_09,
        slide_10,
        slide_11,
        slide_12,
        slide_13,
    ]
    pngs = []
    for i, fn in enumerate(builders, 1):
        img = fn()
        pngs.append(save(img, f"{i:02d}.png"))
        print("slide", i)

    pptx = ROOT / "灵祺种子轮-路演PPT.pptx"
    pdf = ROOT / "灵祺种子轮-路演PPT.pdf"
    build_pptx(pngs, pptx)
    build_pdf(pngs, pdf)

    try:
        DESK.mkdir(parents=True, exist_ok=True)
        for src, name in (
            (pptx, "灵祺种子轮-路演PPT.pptx"),
            (pdf, "灵祺种子轮-路演PPT.pdf"),
        ):
            dest = DESK / name
            dest.write_bytes(src.read_bytes())
        slides_dir = DESK / "单页PNG"
        slides_dir.mkdir(exist_ok=True)
        for p in pngs:
            (slides_dir / p.name).write_bytes(p.read_bytes())
        print("DESK", DESK)
    except OSError as e:
        print("DESK copy skipped:", e)
    print("PPTX", pptx)
    print("PDF", pdf)


if __name__ == "__main__":
    main()
