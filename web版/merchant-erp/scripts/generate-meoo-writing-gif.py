#!/usr/bin/env python3
"""可选：从 meoo-agent-idle.png 程序化生成书写动图。

线上默认使用设计师提供的 `public/meoo-agent-writing.gif`（图1），
仅在需要替换动图且没有新 GIF 时运行本脚本。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IDLE = ROOT / 'public' / 'meoo-agent-idle.png'
OUT = ROOT / 'public' / 'meoo-agent-writing.gif'


def stroke_path(n: int) -> list[tuple[float, int, int]]:
    pts: list[tuple[float, int, int]] = []
    for i in range(n):
        t = i / max(1, n - 1)
        if t < 0.45:
            u = t / 0.45
            dx, dy, ang = 2 + u * 20, 2 + u * 2, -2 - u * 6
        elif t < 0.75:
            u = (t - 0.45) / 0.30
            dx, dy, ang = 22 - u * 8, 4 + u * 10, -8 - u * 10
        else:
            u = (t - 0.75) / 0.25
            dx, dy, ang = 14 + u * 4, 14 - u * 6, -18 + u * 12
        pts.append((ang, int(dx), int(dy)))
    return pts


def main() -> None:
    im = Image.open(IDLE).convert('RGBA')
    w, h = im.size
    brush_box = (0, 42, 172, 242)
    bx0, by0, bx1, by1 = brush_box
    brush_layer = im.crop(brush_box)
    mask_full = Image.new('L', (w, h), 0)
    mask_full.paste(brush_layer.split()[3], (bx0, by0))

    base = im.copy()
    bp, mp = base.load(), mask_full.load()
    for y in range(h):
        for x in range(w):
            if mp[x, y] > 40:
                bp[x, y] = (bp[x, y][0], bp[x, y][1], bp[x, y][2], 0)

    patch = im.crop((95, 95, 250, 260)).resize((bx1 - bx0, by1 - by0), Image.Resampling.LANCZOS)
    base.paste(patch, brush_box, mask_full.crop(brush_box).point(lambda a: min(255, a + 60)))

    pivot_x = int(brush_layer.width * 0.70)
    pivot_y = int(brush_layer.height * 0.86)
    kf = stroke_path(12) + list(reversed(stroke_path(12)[1:-1]))

    rgba_frames: list[Image.Image] = []
    for angle, dx, dy in kf:
        b = brush_layer.rotate(
            angle,
            resample=Image.Resampling.BICUBIC,
            center=(pivot_x, pivot_y),
            expand=True,
        )
        px = bx0 + dx - (b.width - brush_layer.width) // 2
        py = by0 + dy - (b.height - brush_layer.height) // 2
        frame = base.copy()
        frame.paste(b, (px, py), b)
        rgba_frames.append(frame)

    sample = Image.alpha_composite(
        Image.new('RGBA', rgba_frames[0].size, (255, 255, 255, 255)),
        rgba_frames[0],
    )
    sample = Image.alpha_composite(sample, rgba_frames[len(rgba_frames) // 2])
    palette_img = sample.convert('RGB').quantize(colors=64, method=Image.Quantize.MEDIANCUT)

    p_frames: list[Image.Image] = []
    for f in rgba_frames:
        bg = Image.new('RGB', f.size, (255, 255, 255))
        bg.paste(f, mask=f.split()[3])
        p_frames.append(bg.quantize(palette=palette_img, dither=Image.Dither.NONE))

    p_frames[0].save(
        OUT,
        save_all=True,
        append_images=p_frames[1:],
        duration=100,
        loop=0,
        disposal=2,
        optimize=True,
    )
    print(f'Wrote {OUT} ({len(p_frames)} frames, {OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
