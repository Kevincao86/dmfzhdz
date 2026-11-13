#!/usr/bin/env python3
"""生成招募详情 V3 彩色线框图标（96px PNG）"""
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    raise SystemExit('pip install pillow')

ROOT = Path(__file__).resolve().parents[1] / 'images' / 'detail-v3'
SIZE = 96
W = 6


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def save(name, draw_fn):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_fn(d)
    ROOT.mkdir(parents=True, exist_ok=True)
    img.save(ROOT / name, 'PNG')


def calendar(d):
    c = hex_rgb('#2563EB')
    d.rounded_rectangle((18, 22, 78, 78), radius=8, outline=c, width=W)
    d.line((18, 38, 78, 38), fill=c, width=W)
    d.line((34, 14, 34, 28), fill=c, width=W)
    d.line((62, 14, 62, 28), fill=c, width=W)
    d.text((40, 48), '17', fill=c)


def people(d):
    c = hex_rgb('#7C3AED')
    d.ellipse((22, 24, 44, 46), outline=c, width=W)
    d.ellipse((52, 24, 74, 46), outline=c, width=W)
    d.arc((14, 50, 52, 82), start=0, end=180, fill=c, width=W)
    d.arc((44, 50, 82, 82), start=0, end=180, fill=c, width=W)


def pin(d):
    c = hex_rgb('#16A34A')
    d.ellipse((34, 18, 62, 46), outline=c, width=W)
    d.polygon([(48, 46), (36, 78), (60, 78)], outline=c, fill=c)


def platform(d):
    c = hex_rgb('#EA580C')
    d.ellipse((24, 24, 72, 72), outline=c, width=W)
    d.ellipse((36, 36, 60, 60), outline=c, width=W)


def task_doc(d):
    c = hex_rgb('#2563EB')
    d.rounded_rectangle((24, 16, 72, 80), radius=6, outline=c, width=W)
    for y in (34, 48, 62):
        d.line((32, y, 64, y), fill=c, width=3)


def favorite(d):
    c = hex_rgb('#2563EB')
    d.arc((18, 16, 48, 46), start=180, end=0, fill=c, width=W)
    d.arc((48, 16, 78, 46), start=180, end=0, fill=c, width=W)
    d.polygon([(48, 82), (16, 40), (80, 40)], fill=c)


def share(d):
    c = hex_rgb('#2563EB')
    d.rounded_rectangle((16, 36, 50, 70), radius=4, outline=c, width=W)
    d.line((36, 16, 76, 16), fill=c, width=W)
    d.line((76, 16, 76, 56), fill=c, width=W)
    d.line((34, 38, 76, 16), fill=c, width=W)


if __name__ == '__main__':
    save('metric-deadline.png', calendar)
    save('metric-recruit.png', people)
    save('metric-city.png', pin)
    save('metric-platform.png', platform)
    save('icon-task-doc.png', task_doc)
    save('btn-favorite.png', favorite)
    save('btn-share.png', share)
    print('OK:', ROOT)
