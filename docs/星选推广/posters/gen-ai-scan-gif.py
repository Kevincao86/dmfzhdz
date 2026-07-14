#!/usr/bin/env python3
"""生成 AI 扫描动效 GIF，供公众号嵌入"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'xingxuan-ai-scan-anim.gif')
W, H = 900, 506
FRAMES = 24

def lerp(a, b, t):
    return int(a + (b - a) * t)

def frame(i):
    img = Image.new('RGB', (W, H), '#f0eff6')
    draw = ImageDraw.Draw(img)
    # card
    draw.rounded_rectangle([40, 40, W - 40, H - 40], radius=24, fill='#ffffff', outline='#e2e8f0', width=2)
    # title bar
    draw.rounded_rectangle([64, 64, 320, 108], radius=12, fill='#7c83ff')
    draw.text((84, 74), 'AI 合规检核中…', fill='#ffffff')
    # lines
    for y in range(140, 380, 36):
        draw.rounded_rectangle([64, y, W - 120, y + 18], radius=8, fill='#f1f5f9')
    # scan beam
    t = i / FRAMES
    sy = 120 + int((H - 200) * t)
    for k in range(8):
        alpha = 1 - k / 8
        c = lerp(124, 255, alpha * 0.5)
        draw.rectangle([60, sy - k * 6, W - 60, sy - k * 6 + 4], fill=(lerp(124, 200, alpha), lerp(131, 220, alpha), 255))
    # status pills
    draw.rounded_rectangle([64, H - 100, 240, H - 56], radius=999, fill='#ecfdf5', outline='#6ee7b7')
    draw.text((88, H - 88), '✓ 口播文案', fill='#059669')
    draw.rounded_rectangle([260, H - 100, 440, H - 56], radius=999, fill='#fef2f2', outline='#fecaca')
    draw.text((284, H - 88), '⚠ 极限用语', fill='#dc2626')
    draw.rounded_rectangle([460, H - 100, 640, H - 56], radius=999, fill='#eff6ff', outline='#93c5fd')
    draw.text((484, H - 88), '扫描字幕…', fill='#0284c7')
    return img

imgs = [frame(i) for i in range(FRAMES)]
imgs[0].save(OUT, save_all=True, append_images=imgs[1:], duration=80, loop=0, optimize=True)
print('OK', OUT)
