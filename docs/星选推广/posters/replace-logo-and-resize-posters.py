#!/usr/bin/env python3
"""抠图 logo + 三张海报：去旧品牌条、替换新 logo、等比扩至 9:16 满宽"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
ASSETS = '/Users/damowang/.cursor/projects/Volumes-OS-Users-damowangOS-AI-ERP/assets'
OUT_W, OUT_H = 1080, 1920

LOGO_SRC = os.path.join(ASSETS, '_____20260619104214_1721_426-49def7bc-72c3-4000-8b1f-77f597319b8b.png')
if not os.path.exists(LOGO_SRC):
    LOGO_SRC = os.path.join(ROOT, '../../灵祺星选小程序抖音版/灵祺星选/images/logo.png')

POSTERS = [
    ('xingxuan-ai-compliance-poster-01-hero-9x16.png', 0.145),  # 含底栏+标语，多裁一点
    ('xingxuan-ai-compliance-poster-02-dual-role-9x16.png', 0.105),
    ('xingxuan-ai-compliance-poster-03-before-after-9x16.png', 0.115),
]


def load_font(size):
    for p in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Light.ttc']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def cutout_circular_logo(src_path, out_path, size=256):
    img = Image.open(src_path).convert('RGBA')
    w, h = img.size
    cx, cy = w // 2, h // 2
    r = min(w, h) // 2 - 4
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.0))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    crop = out.crop((cx - r, cy - r, cx + r, cy + r)).resize((size, size), Image.Resampling.LANCZOS)
    crop.save(out_path, 'PNG')
    return crop


def gradient_bg(w, h, top=(240, 239, 246), mid=(232, 244, 253), bot=(220, 238, 255)):
    img = Image.new('RGB', (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        if t < 0.5:
            u = t / 0.5
            c = tuple(int(top[i] + (mid[i] - top[i]) * u) for i in range(3))
        else:
            u = (t - 0.5) / 0.5
            c = tuple(int(mid[i] + (bot[i] - mid[i]) * u) for i in range(3))
        draw.line([(0, y), (w, y)], fill=c)
    return img


def paint_old_logo_bars(body: Image.Image) -> Image.Image:
    """覆盖原图中部/底部的旧品牌条（深色横条区域）"""
    img = body.copy()
    w, h = img.size
    px = img.load()

    def row_is_dark_bar(y, thr=70):
        dark = 0
        for x in range(0, w, 8):
            r, g, b = px[x, y][:3]
            if r < 90 and g < 90 and b < 130 and (r + g + b) < 200:
                dark += 1
        return dark > (w // 8) * 0.55

    # 找深色横条（高度 40~120px）
    spans = []
    y = int(h * 0.62)
    while y < h - 10:
        if row_is_dark_bar(y):
            y0 = y
            while y < h and row_is_dark_bar(y):
                y += 1
            if 30 <= (y - y0) <= 140:
                spans.append((y0, y))
        else:
            y += 1

    draw = ImageDraw.Draw(img)
    for y0, y1 in spans:
        # 用上下邻域颜色填充
        sample_y = max(0, y0 - 8)
        r, g, b = px[w // 2, sample_y][:3]
        draw.rectangle([0, y0, w, y1], fill=(r, g, b))
    return img


def make_footer(logo_img, bar_h=100):
    logo_size = 72
    font = load_font(34)
    text = '灵祺星选'
    bar = Image.new('RGB', (OUT_W, bar_h), (48, 42, 110))
    overlay = Image.new('RGBA', (OUT_W, bar_h), (0, 0, 0, 0))
    logo = logo_img.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
    td = ImageDraw.Draw(overlay)
    try:
        bbox = td.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
    except Exception:
        tw = 120
    gap = 14
    total = logo_size + gap + tw
    x0 = (OUT_W - total) // 2
    y0 = (bar_h - logo_size) // 2
    overlay.paste(logo, (x0, y0), logo)
    td.text((x0 + logo_size + gap, y0 + 16), text, fill=(255, 255, 255, 255), font=font)
    bar.paste(overlay, (0, 0), overlay)
    return bar


def build_poster(src_path, logo_img, out_path, footer_crop_ratio):
    src = Image.open(src_path).convert('RGB')
    w, h = src.size

    cut = int(h * footer_crop_ratio)
    body = src.crop((0, 0, w, h - cut))
    body = paint_old_logo_bars(body)

    bw, bh = body.size
    nh = int(bh * (OUT_W / bw))
    scaled = body.resize((OUT_W, nh), Image.Resampling.LANCZOS)
    bar = make_footer(logo_img)
    bar_h = bar.size[1]
    total = nh + bar_h

    if total <= OUT_H:
        canvas = gradient_bg(OUT_W, OUT_H)
        y0 = (OUT_H - total) // 2
        canvas.paste(scaled, (0, y0))
        canvas.paste(bar, (0, y0 + nh))
        final = canvas
    else:
        tmp = Image.new('RGB', (OUT_W, total), (240, 239, 246))
        tmp.paste(scaled, (0, 0))
        tmp.paste(bar, (0, nh))
        final = tmp.crop((0, total - OUT_H, OUT_W, total))

    final.save(out_path, 'PNG', optimize=True)
    print('OK', out_path, final.size)


def main():
    logo_path = os.path.join(ROOT, 'xingxuan-logo-cutout.png')
    logo = cutout_circular_logo(LOGO_SRC, logo_path)
    for fname, ratio in POSTERS:
        src = os.path.join(ASSETS, fname)
        if not os.path.exists(src):
            src = os.path.join(ROOT, fname)
        out = os.path.join(ROOT, fname)
        build_poster(src, logo, out, ratio)


if __name__ == '__main__':
    main()
