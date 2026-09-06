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


def footer(draw, page: int, total: int = 12, light: bool = False):
    c = (210, 210, 210) if light else MUTED
    text(draw, (80, 1036), "灵祺 · 种子轮  保密", f_body(18, True), c)
    text(draw, (1840, 1036), f"{page:02d} / {total:02d}", f_body(18, True), c, "rt")


def card(draw, box, fill=WHITE, outline=LINE, r=18):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=1)


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


def slide_01():
    img = overlay(darken(load_cover("lingqi-seed-cover.png"), 0.38), alpha=90)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 14, H), fill=RUST)
    text(d, (80, 86), "SEED  ·  2026.09", f_sans(20), GOLD)
    text(d, (80, 280), "灵祺", f_title(118), WHITE)
    text(d, (80, 430), "本地生活 Merchant AI Agent", f_title(46), CREAM)
    text(d, (80, 500), "可验证达人履约网络", f_title(46), CREAM)
    d.rectangle((80, 572, 220, 576), fill=RUST)
    text(
        d,
        (80, 610),
        "商家 ERP 经营  ×  星选达人履约  ·  杭甬温",
        f_body(26, True),
        (220, 214, 204),
    )
    text(d, (80, 860), "种子轮  人民币 400 万元", f_body(28), WHITE)
    text(
        d,
        (80, 910),
        "宁波墨典网络科技有限公司  ·  曹鑫淼  15757468650",
        f_body(20, True),
        (200, 196, 188),
    )
    text(d, (1840, 910), "数据截至 2026-09-06 服务器快照", f_body(18, True), (180, 176, 168), "rt")
    return img


def slide_02():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "01  /  我们做什么", f_sans(18), RUST)
    text(d, (80, 108), "商户不是缺平台，是缺一套操作系统", f_title(46), INK)
    wrap_draw(
        d,
        (80, 180),
        "本地生活门店已被抖音、美团推着做短视频和达人种草。现实仍是微信群 + 表格：组品不会、达人难管、履约不可证。灵祺把经营和履约做成同一条流水线。",
        f_body(24, True),
        MUTED,
        1760,
    )
    boxes = [
        (80, 340, 620, 720, "左边", "商家 / 服务商 AI ERP", "组品 · Brief · 店铺分析\n短视频 · 投流 · 预览后写入"),
        (660, 340, 1260, 720, "中间", "运营注册表", "单一事实来源\n商家、星选、运营台同源"),
        (1300, 340, 1840, 720, "右边", "星选履约网络", "招募 · 报名 · 探店 / 云剪\n回链核查 · 结算"),
    ]
    for x0, y0, x1, y1, k, t, b in boxes:
        card(d, (x0, y0, x1, y1), fill=WHITE)
        d.rectangle((x0, y0, x0 + 8, y1), fill=RUST if k != "中间" else TEAL)
        text(d, (x0 + 36, y0 + 36), k, f_sans(16), RUST)
        text(d, (x0 + 36, y0 + 78), t, f_title(30), INK)
        yy = y0 + 160
        for line in b.split("\n"):
            text(d, (x0 + 36, yy), line, f_body(22, True), MUTED)
            yy += 40
    text(
        d,
        (80, 800),
        "本轮要验证三件事：产品已上线、供需双边已有密度、单位经济可在杭甬温被审计。",
        f_body(24),
        INK,
    )
    text(
        d,
        (80, 860),
        "400 万用来把「能用」做成「能收费、能复制」。",
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
    text(d, (880, 118), "四件事实还停在群和表", f_title(40), INK)
    pains = [
        ("不会操盘", "组品、Brief、评价散落多个后台，依赖代运营口头方案"),
        ("达人难管", "通告群和私聊没有统一状态，排期对账靠人盯"),
        ("履约不可证", "截图和口头确认，结算纠纷高发"),
        ("代运营难复制", "一个服务商管多家店，只能靠表格切换客户"),
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
    text(d, (80, 108), "双引擎，一条流水线", f_title(48), WHITE)
    text(
        d,
        (80, 180),
        "AI 不是聊天玩具。写操作强制预览确认。履约不是发通告，回链可核查。",
        f_body(22, True),
        (220, 214, 204),
    )
    left = [
        ("Merchant AI Agent", "自然语言完成组品 / Brief / 经营方案"),
        ("预览确认后写入", "降低误操作，利于 ToB 审计"),
        ("跨平台编排", "来客、美团、小红书，不替代平台交易"),
    ]
    right = [
        ("星选四身份", "达人 · PR · 拍摄 · 剪辑"),
        ("开环探店 + 云剪闭环", "报名、反选、交付、回链、结算"),
        ("注册表中枢", "商家 ERP / 星选 / 运营台同一套数据"),
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
    text(d, (80, 108), "四端已上线，主链路可演示", f_title(44), INK)
    rows = [
        ("商家 ERP", "cs.mofangdianai.com", "商户", "AI 智能体 / 组品 / 招募 / 短视频 / 店铺分析"),
        ("服务商 ERP", "fws.mofangdianai.com", "代运营", "多租户、客户绑定、批量导入门店"),
        ("星选平台", "dr.mofangdianai.com · 微信搜灵祺星选", "达人 / PR / 团队", "大厅、急单、云剪、私信、积分"),
        ("运营台 + API", "mofangdianai.com/erp-api", "内部", "212 条路由，服务器连续运行 100 天"),
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
    text(d, (80, 108), "2026-09-06 服务器快照，可复核", f_title(40), INK)
    items = [
        (80, 210, 520, 430, "737", "星选会员档案", "小程序账号 793"),
        (540, 210, 980, 430, "293", "招募单", "累计报名 1,979"),
        (1000, 210, 1440, 430, "527", "运营达人库", "中位粉丝 2.2 万"),
        (1460, 210, 1840, 430, "38", "PR", "拍摄 46 · 剪辑 22"),
        (80, 460, 520, 680, "32", "ERP 租户", "其中具名经营主体约 14 家"),
        (540, 460, 980, 680, "59,643", "同步平台订单", "3 家深度店 · 107 POI"),
        (1000, 460, 1440, 680, "733万", "同步 GMV", "商户成交，不是灵祺收入"),
        (1460, 460, 1840, 680, "6,397", "AI 调用", "1,224 万 Token"),
    ]
    for box in items:
        kpi(d, box[:4], box[4], box[5], box[6])
    card(d, (80, 720, 1840, 980), fill=(36, 28, 22), outline=(36, 28, 22))
    text(d, (110, 760), "核心经营指标", f_sans(18), GOLD)
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
        "733 万是商户在抖音侧的成交，证明 ERP 已接入真实经营数据。公司收入仍来自订阅、履约与积分。",
        f_body(20, True),
        (210, 200, 188),
    )
    footer(d, 6)
    return img


def slide_07():
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "06  /  数据口径", f_sans(18), RUST)
    text(d, (80, 108), "付费与用量分开披露", f_title(40), INK)
    card(d, (80, 210, 920, 980))
    text(d, (110, 240), "32 个 ERP 租户构成", f_title(26), INK)
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
        ("塔塔（服务商）", "36,470 单", "73 POI", "GMV 267 万"),
        ("极道（服务商）", "16,434 单", "12 POI", "GMV 370 万"),
        ("XJC 徽农商地锅鸡", "6,739 单", "24 POI", "GMV 96 万 · 已付 598"),
    ]
    y = 330
    for name, a, b, c in shops:
        card(d, (990, y, 1810, y + 170), fill=CREAM, outline=LINE)
        text(d, (1020, y + 28), name, f_title(24), INK)
        text(d, (1020, y + 84), f"{a}   ·   {b}   ·   {c}", f_body(20, True), MUTED)
        y += 190
    text(d, (990, 900), "会员档位已开通 14 户，多数为运营赠送，尚未形成经常性收入。", f_body(18, True), MUTED)
    footer(d, 7)
    return img


def slide_08():
    photo = load_cover("lingqi-seed-talent.png")
    photo = photo.resize((820, 1080), Image.Resampling.LANCZOS)
    img = new_slide()
    img.paste(photo, (1100, 0))
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "07  /  供给侧", f_sans(18), RUST)
    text(d, (80, 108), "温州已经有密度", f_title(44), INK)
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
        "注册高峰在夏季。8 月后转入质量运营。本轮资金用于做深单城供给，而不是全国投放。",
        f_body(22, True),
        MUTED,
    )
    text(
        d,
        (80, 860),
        "大厅 46% 的招募单有人报名，峰值单 85 人。主路径仍是 PR 代发，商家直发刚开始。",
        f_body(22, True),
        MUTED,
    )
    footer(d, 8)
    return img


def slide_09():
    img = overlay(darken(load_cover("lingqi-seed-cities.png"), 0.36), alpha=95)
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "08  /  市场与战场", f_sans(18), GOLD)
    text(d, (80, 108), "先把杭甬温做成密度，再谈下一城", f_title(42), WHITE)
    facts = [
        ("13.7 万亿", "本地商家服务业规模（公开转述）"),
        ("691 亿", "餐饮线上运营解决方案 2024"),
        ("约 3%", "前五大合计市占，市场极度分散"),
        ("0.8–1.5 万", "杭甬温可服务 SAM（有种草预算门店）"),
    ]
    x = 80
    for v, l in facts:
        card(d, (x, 240, x + 420, 430), fill=(12, 22, 34), outline=(55, 66, 78))
        text(d, (x + 28, 270), v, f_title(32), GOLD)
        wrap_draw(d, (x + 28, 340), l, f_body(18, True), (210, 204, 196), 360)
        x += 450
    cities = [
        ("宁波", "灰测与标杆大本营，地推成本可控"),
        ("温州", "民营商户付费意愿强，达人供给 264 人"),
        ("杭州", "品牌、人才、后续融资窗口"),
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
    text(d, (80, 108), "定价已验证，本轮重点是转化为经常性收入", f_title(36), INK)
    models = [
        ("商家 SaaS", "约 ¥168 / 月", "支付页已出现 168 档"),
        ("履约 / 撮合", "¥10–50 / 单", "大厅已有预算字段"),
        ("达人 / PR 会员", "约 ¥9.9 / 月", "积分月赠已跑，充值几乎为 0"),
        ("服务商席位", "1.98–4.98 万 / 年", "5 个服务商租户待转合同"),
        ("AI / 云资源", "Token / 云剪加价", "7 月 4286 次调用可作报价"),
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
    img = new_slide()
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "10  /  竞争与里程碑", f_sans(18), RUST)
    text(d, (80, 108), "未来 12–24 个月目标", f_title(42), INK)
    comps = [
        ("再惠", "高客单全栈代运营", "我们：低价自助 + 区域密度"),
        ("有赞", "经营系统 + 种草打包", "我们：原生撮合 + 回链核查"),
        ("通告 App", "只抢营销预算", "我们：经营一体，不只发单"),
        ("来客 / 美团", "平台后台够用化", "我们：跨平台编排，不碰资金"),
    ]
    x = 80
    for a, b, c in comps:
        card(d, (x, 200, x + 420, 430))
        text(d, (x + 24, 228), a, f_title(26), INK)
        wrap_draw(d, (x + 24, 286), b, f_body(18, True), MUTED, 360)
        wrap_draw(d, (x + 24, 350), c, f_body(18), TEAL, 360)
        x += 450
    text(d, (80, 480), "分阶段目标", f_title(26), INK)
    miles = [
        ("当前", "具名约 14 · 深用 3", "以服务器快照为准"),
        ("M3", "付费 30–60", "3 个账单级案例"),
        ("M6", "150–300", "≥3 家服务商付费导入"),
        ("M12", "800–1,500", "ARPU / 留存可披露"),
    ]
    x = 80
    for t, a, b in miles:
        card(d, (x, 540, x + 420, 860))
        text(d, (x + 28, 572), t, f_sans(18), RUST)
        text(d, (x + 28, 620), a, f_title(26), INK)
        wrap_draw(d, (x + 28, 700), b, f_body(20, True), MUTED, 350)
        x += 450
    text(
        d,
        (80, 910),
        "以上为目标区间，将按上一阶段验证结果滚动调整。",
        f_body(20, True),
        MUTED,
    )
    footer(d, 11)
    return img


def slide_12():
    img = overlay(darken(load_cover("lingqi-seed-close.png"), 0.40), alpha=100)
    d = ImageDraw.Draw(img)
    text(d, (80, 64), "11  /  本轮邀请", f_sans(18), GOLD)
    text(d, (80, 108), "种子轮  人民币 400 万元", f_title(48), WHITE)
    text(
        d,
        (80, 190),
        "首次交割 300 万即可启动，超募上限 500 万。2–3 家共同参与即可。",
        f_body(22, True),
        (220, 214, 204),
    )
    inst = [
        ("P0  本周提交", "宁波天使引导基金  ·  奇绩创坛  ·  天使湾  ·  浙商创投"),
        ("P1  两周跟进", "梅花  ·  真格 prompt@  ·  阿米巴  ·  线性资本"),
    ]
    y = 280
    for t, b in inst:
        card(d, (80, y, 1200, y + 130), fill=(12, 22, 34), outline=(55, 66, 78))
        text(d, (110, y + 28), t, f_sans(16), GOLD)
        text(d, (110, y + 68), b, f_body(22, True), CREAM)
        y += 150
    card(d, (80, 590, 1200, 900), fill=(12, 22, 34), outline=(55, 66, 78))
    text(d, (110, 630), "宁波墨典网络科技有限公司", f_title(28), WHITE)
    text(d, (110, 700), "创始人  曹鑫淼", f_body(24), CREAM)
    text(d, (110, 750), "手机 / 微信  15757468650", f_body(24), CREAM)
    text(d, (110, 800), "商家 ERP  cs.mofangdianai.com", f_body(20, True), (200, 196, 188))
    text(d, (110, 844), "星选  dr.mofangdianai.com  ·  微信搜「灵祺星选」", f_body(20, True), (200, 196, 188))
    footer(d, 12, light=True)
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
    pages = [Image.open(p).convert("RGB") for p in pngs]
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
    print("PPTX", pptx)
    print("PDF", pdf)
    print("DESK", DESK)


if __name__ == "__main__":
    main()
