#!/usr/bin/env python3
"""生成招募单封面图库 PNG（平台 + 达人标签），输出到小程序与履约 Web public。"""
from __future__ import annotations

import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIRS = [
    ROOT / "灵祺达人撮合小程序/assets/recruit-covers",
    ROOT / "灵祺达人履约管理后台/public/recruit-covers",
]

W, H = 750, 600

PLATFORMS = {
    "douyin": ("抖音", [(15, 15, 20), (254, 44, 85), (0, 0, 0)]),
    "xiaohongshu": ("小红书", [(255, 36, 66), (255, 120, 140), (255, 230, 235)]),
    "dianping": ("大众点评", [(255, 102, 0), (255, 180, 60), (255, 240, 220)]),
    "kuaishou": ("快手", [(255, 80, 0), (255, 170, 0), (40, 40, 48)]),
    "channels": ("微信视频号", [(7, 193, 96), (16, 120, 80), (230, 250, 240)]),
}

TAGS = {
    "meishi": ("美食", [(255, 120, 40), (255, 200, 120)]),
    "muying": ("母婴", [(255, 182, 193), (255, 240, 245)]),
    "jiaju": ("家居家装", [(120, 160, 200), (220, 235, 245)]),
    "shenghuo": ("生活记录", [(180, 140, 220), (240, 230, 255)]),
    "meizhuang": ("美妆时尚", [(220, 80, 140), (255, 210, 230)]),
    "jiankang": ("健康养生", [(60, 170, 120), (210, 245, 225)]),
    "yundong": ("运动健身", [(30, 120, 255), (180, 220, 255)]),
    "jiaoyu": ("教育", [(70, 130, 255), (210, 225, 255)]),
    "sheying": ("摄影", [(40, 50, 70), (120, 140, 180)]),
    "lvyou": ("酒店旅游", [(0, 160, 220), (180, 235, 255)]),
    "wenhua": ("文化艺术", [(140, 90, 200), (230, 215, 255)]),
    "xingqu": ("兴趣爱好", [(255, 160, 60), (255, 230, 180)]),
    "shuma": ("科技数码", [(20, 30, 50), (80, 120, 200)]),
    "yingshi": ("影视综艺", [(180, 60, 255), (240, 210, 255)]),
    "chongwu": ("宠物", [(255, 190, 80), (255, 245, 210)]),
    "qinggan": ("情感", [(255, 100, 130), (255, 220, 230)]),
    "gaoxiao": ("搞笑", [(255, 210, 0), (255, 250, 180)]),
    "yule": ("娱乐资讯", [(255, 60, 120), (255, 200, 220)]),
    "qiche": ("汽车", [(50, 60, 80), (160, 170, 190)]),
    "caijing": ("商业财经", [(20, 80, 60), (180, 210, 200)]),
    "youxi": ("游戏", [(90, 50, 200), (200, 180, 255)]),
    "minsheng": ("民生资讯", [(80, 120, 140), (210, 225, 235)]),
    "tiyu": ("体育赛事", [(0, 130, 80), (180, 230, 200)]),
    "zhishi": ("知识", [(255, 140, 0), (255, 230, 180)]),
    "qita": ("其它", [(120, 120, 140), (220, 220, 235)]),
}


def load_font(size: int):
    for name in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.isfile(name):
            try:
                return ImageFont.truetype(name, size)
            except OSError:
                pass
    return ImageFont.load_default()


def gradient_bg(draw: ImageDraw.ImageDraw, c1, c2, c3=None):
    for y in range(H):
        t = y / max(H - 1, 1)
        if c3 and t > 0.55:
            t2 = (t - 0.55) / 0.45
            r = int(c2[0] + (c3[0] - c2[0]) * t2)
            g = int(c2[1] + (c3[1] - c2[1]) * t2)
            b = int(c2[2] + (c3[2] - c2[2]) * t2)
        else:
            t1 = min(t / 0.55, 1.0) if c3 else t
            r = int(c1[0] + (c2[0] - c1[0]) * t1)
            g = int(c1[1] + (c2[1] - c1[1]) * t1)
            b = int(c1[2] + (c2[2] - c1[2]) * t1)
        draw.line([(0, y), (W, y)], fill=(r, g, b))


def draw_cover(path: Path, title: str, subtitle: str, colors, variant: int):
    img = Image.new("RGB", (W, H), colors[0])
    draw = ImageDraw.Draw(img)
    c1, c2 = colors[0], colors[1]
    c3 = colors[2] if len(colors) > 2 else None
    if variant == 2:
        c1, c2 = c2, c1
    elif variant == 3 and c3:
        c1, c2, c3 = c2, c3, c1
    gradient_bg(draw, c1, c2, c3)
    # decorative circles
    draw.ellipse([W - 220, -80, W + 40, 180], fill=(255, 255, 255, 30))
    draw.ellipse([-60, H - 200, 180, H + 40], fill=(255, 255, 255, 20))
    font_l = load_font(52)
    font_s = load_font(28)
    draw.text((48, H - 180), title, fill=(255, 255, 255), font=font_l)
    draw.text((48, H - 110), subtitle, fill=(255, 255, 255), font=font_s)
    draw.text((48, 40), "灵祺星选 · 招募", fill=(255, 255, 255), font=font_s)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def build_manifest() -> dict:
    manifest = {"platforms": {}, "tags": {}}
    for slug, (label, _colors) in PLATFORMS.items():
        items = []
        for i in range(1, 4):
            rel = f"platforms/{slug}-{i}.jpg"
            items.append({"id": f"platform-{slug}-{i}", "path": rel, "label": f"{label} · 封面{i}"})
        manifest["platforms"][label] = items
    for slug, (label, _colors) in TAGS.items():
        items = []
        for i in range(1, 3):
            rel = f"tags/{slug}-{i}.jpg"
            items.append({"id": f"tag-{slug}-{i}", "path": rel, "label": f"{label} · 封面{i}"})
        manifest["tags"][label] = items
    return manifest


def write_manifest(manifest: dict) -> None:
    manifest_json = json.dumps(manifest, ensure_ascii=False, indent=2)
    mp_manifest_js = ROOT / "灵祺达人撮合小程序/utils/recruitCoverLibrary.manifest.js"
    mp_manifest_js.write_text(f"module.exports = {manifest_json}\n", encoding="utf-8")
    (ROOT / "灵祺达人撮合小程序/utils/recruitCoverLibrary.manifest.json").write_text(manifest_json, encoding="utf-8")
    fulfillment_manifest = ROOT / "灵祺达人履约管理后台/src/lib/mpSync/recruitCoverLibrary.manifest.json"
    fulfillment_manifest.write_text(manifest_json, encoding="utf-8")
    print(f"OK: manifest -> {mp_manifest_js}")


def main():
    import sys

    manifest_only = "--manifest-only" in sys.argv
    manifest = build_manifest()
    if not manifest_only:
        for out_root in OUT_DIRS:
            for slug, (label, colors) in PLATFORMS.items():
                for i in range(1, 4):
                    rel = f"platforms/{slug}-{i}.png"
                    draw_cover(out_root / rel, label, f"平台封面 {i}", colors, i)
            for slug, (label, colors) in TAGS.items():
                for i in range(1, 3):
                    rel = f"tags/{slug}-{i}.png"
                    draw_cover(out_root / rel, label, f"达人标签 · 封面{i}", colors + [colors[0]], i)
        print(f"OK: wrote PIL placeholder covers to {len(OUT_DIRS)} dirs")
    write_manifest(manifest)


if __name__ == "__main__":
    main()
