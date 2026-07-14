#!/usr/bin/env python3
"""将 AI 横版海报（1536×1024）转为公众号竖版 9:16（1080×1920）"""
from PIL import Image, ImageDraw
import os

BASE = os.path.join(os.path.dirname(__file__), '..')
FILES = [
    'xingxuan-ai-compliance-poster-01-hero-9x16.png',
    'xingxuan-ai-compliance-poster-02-dual-role-9x16.png',
    'xingxuan-ai-compliance-poster-03-before-after-9x16.png',
]
OUT_W, OUT_H = 1080, 1920
PAD_TOP = 120
PAD_BOTTOM = 140


def gradient_bg(w, h):
    img = Image.new('RGB', (w, h))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(h - 1, 1)
        # #f0eff6 -> #e8f4fd -> #dceeff
        if t < 0.5:
            u = t / 0.5
            r = int(240 + (232 - 240) * u)
            g = int(239 + (244 - 239) * u)
            b = int(246 + (253 - 246) * u)
        else:
            u = (t - 0.5) / 0.5
            r = int(232 + (220 - 232) * u)
            g = int(244 + (238 - 244) * u)
            b = int(253 + (255 - 253) * u)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return img


def convert(name):
    src_path = os.path.join(BASE, name)
    img = Image.open(src_path).convert('RGB')
    iw, ih = img.size
    canvas = gradient_bg(OUT_W, OUT_H)

    # 内容区：左右留 48px，上下留 PAD
    max_w = OUT_W - 96
    max_h = OUT_H - PAD_TOP - PAD_BOTTOM
    scale = min(max_w / iw, max_h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)

    x = (OUT_W - nw) // 2
    y = PAD_TOP + (max_h - nh) // 2

    # 白色卡片底 + 圆角感（矩形 + 浅阴影模拟）
    shadow = Image.new('RGBA', (OUT_W, OUT_H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [x - 8, y - 8, x + nw + 8, y + nh + 8],
        radius=24,
        fill=(124, 131, 255, 28),
    )
    canvas = canvas.convert('RGBA')
    canvas = Image.alpha_composite(canvas, shadow)
    canvas = canvas.convert('RGB')

    card = Image.new('RGB', (nw + 16, nh + 16), '#ffffff')
    canvas.paste(card, (x - 8, y - 8))
    canvas.paste(resized, (x, y))

    # 底部品牌条
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([64, OUT_H - 96, OUT_W - 64, OUT_H - 36], radius=16, fill='#7c83ff')
    try:
        from PIL import ImageFont
        font = ImageFont.truetype('/System/Library/Fonts/PingFang.ttc', 28)
    except Exception:
        font = ImageFont.load_default()
    draw.text((OUT_W // 2, OUT_H - 78), '灵祺星选 · AI 合规检核', fill='#ffffff', anchor='mm', font=font)

    out_path = src_path  # 覆盖原文件
    canvas.save(out_path, 'PNG', optimize=True)
    print(f'OK {name} -> {OUT_W}x{OUT_H}')


if __name__ == '__main__':
    for f in FILES:
        convert(f)
