#!/usr/bin/env python3
"""用商家 ERP 同源 Seedance 接口，将官网 30s 关键帧做成演示成片。"""
from __future__ import annotations

import base64
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://mofangdianai.com/erp-api"
MODEL = "doubao-seedance-1-5-pro-251215"
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
SEG = OUT / "segments"

CANVAS = [
    (
        "canvas-01-open.png",
        "Product UI screen recording style: Chinese SaaS infinite canvas with shot cards on gray grid, slow cinematic push-in, cyan accents, continuous camera motion, photorealistic screen UI, no extra text overlay",
    ),
    (
        "canvas-02-add-shot.png",
        "Product demo: cursor clicks green Add Shot button, a new shot card appears on infinite canvas, smooth UI motion, cyan Chinese SaaS interface, continuous motion, photorealistic",
    ),
    (
        "canvas-03-add-media.png",
        "Product demo: media thumbnails appear under shot cards on infinite canvas, images and video clips attaching, cyan UI, continuous gentle camera, photorealistic screen",
    ),
    (
        "canvas-04-link.png",
        "Product demo: dragging a cyan dashed connection line between shot cards on infinite canvas, free linking workflow, continuous motion, photorealistic Chinese SaaS UI",
    ),
    (
        "canvas-05-apply-flow.png",
        "Product demo: Apply Flow button highlight, shot order animates along flow arrows 1 to 2 to 3, cyan accents, continuous motion, photorealistic UI",
    ),
    (
        "canvas-06-cta.png",
        "Product demo end: canvas and short-video workspace side by side, brand finish, soft push-in, cyan Chinese SaaS, continuous motion, photorealistic, no extra logos",
    ),
]

SHORTFILM = [
    (
        "shortfilm-01-prompt.png",
        "Product demo: short video generation page, typing into guidance prompt box, Chinese SaaS UI cyan accents, continuous motion, photorealistic screen recording style",
    ),
    (
        "shortfilm-02-plan.png",
        "Product demo: AI fills storyboard table rows automatically, script cells animate in, cyan Chinese SaaS, continuous motion, photorealistic UI",
    ),
    (
        "shortfilm-03-refs.png",
        "Product demo: uploading reference food photos into grid, thumbnails pop in, cyan UI, continuous motion, photorealistic",
    ),
    (
        "shortfilm-04-generating.png",
        "Product demo: generating progress card with spinner and percent rising, soft pulse, cyan SaaS UI, continuous motion, photorealistic",
    ),
    (
        "shortfilm-05-result.png",
        "Product demo: finished vertical video preview on phone mockup playing restaurant food shot, play button, cyan UI around, continuous motion, photorealistic",
    ),
    (
        "shortfilm-06-cta.png",
        "Brand end card: Lingqi AI short video one-click CTA, soft light background, gentle zoom, premium Chinese SaaS, continuous motion, photorealistic, minimal text in image",
    ),
]


def http_json(method: str, url: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        return json.loads(res.read().decode("utf-8"))


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=240) as res, dest.open("wb") as f:
        while True:
            chunk = res.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)


def png_to_jpeg_b64(png: Path) -> str:
    jpg = SEG / f"{png.stem}.jpg"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(png),
            "-vf",
            "scale=1280:-2",
            "-q:v",
            "4",
            str(jpg),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return base64.b64encode(jpg.read_bytes()).decode("ascii")


def start_i2v(prompt: str, image_b64: str) -> str:
    body = {
        "prompt": prompt,
        "flags": {
            "duration": 5,
            "aspect_ratio": "16:9",
            "resolution": "720p",
            "fps": 24,
        },
        "model": MODEL,
        "skip_qwen": True,
        "images_base64": [image_b64],
        "i2v_max_images": 1,
    }
    j = http_json("POST", f"{API}/meoo-merchant-ai-video-seedance-start", body)
    if not j.get("ok") or not j.get("taskId"):
        raise RuntimeError(f"start failed: {j}")
    return str(j["taskId"])


def poll(task_id: str, label: str) -> str:
    for i in range(1, 90):
        qs = urllib.parse.urlencode({"taskId": task_id})
        try:
            j = http_json("GET", f"{API}/meoo-merchant-ai-video-seedance-status?{qs}")
        except urllib.error.HTTPError as e:
            print(f"POLL_HTTP {label} #{i} {e}", flush=True)
            time.sleep(6)
            continue
        phase = j.get("phase")
        print(f"POLL {label} #{i} phase={phase}", flush=True)
        if phase == "succeeded" and j.get("videoUrl"):
            return str(j["videoUrl"])
        if phase == "failed" or j.get("ok") is False:
            raise RuntimeError(f"failed {label}: {j}")
        time.sleep(6)
    raise TimeoutError(f"timeout {label}")


def concat(parts: list[Path], dest: Path) -> None:
    lst = SEG / f"{dest.stem}_list.txt"
    lst.write_text("".join(f"file '{p.resolve()}'\n" for p in parts), encoding="utf-8")
    tmp = dest.with_suffix(".tmp.mp4")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(lst),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "24",
            "-an",
            "-movflags",
            "+faststart",
            str(tmp),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    tmp.replace(dest)


def run_pack(name: str, folder: Path, items: list[tuple[str, str]]) -> Path:
    print(f"\n== PACK {name} ==", flush=True)
    started: list[tuple[str, str, Path]] = []
    for fname, prompt in items:
        png = folder / fname
        if not png.exists():
            raise FileNotFoundError(png)
        seg_mp4 = SEG / f"{png.stem}.mp4"
        if seg_mp4.exists() and seg_mp4.stat().st_size > 50_000:
            print(f"SKIP_EXISTS {png.stem}", flush=True)
            started.append((png.stem, "", seg_mp4))
            continue
        print(f"ENCODE_IMG {png.name}", flush=True)
        b64 = png_to_jpeg_b64(png)
        tid = start_i2v(prompt, b64)
        print(f"STARTED {png.stem} task={tid}", flush=True)
        started.append((png.stem, tid, seg_mp4))
        time.sleep(1.0)

    parts: list[Path] = []
    for label, tid, seg_mp4 in started:
        if seg_mp4.exists() and seg_mp4.stat().st_size > 50_000 and not tid:
            parts.append(seg_mp4)
            continue
        url = poll(tid, label)
        download(url, seg_mp4)
        print(f"SAVED {seg_mp4.name} size={seg_mp4.stat().st_size}", flush=True)
        parts.append(seg_mp4)

    dest = OUT / f"demo-{name}-30s.mp4"
    concat(parts, dest)
    print(f"DONE {dest} size={dest.stat().st_size}", flush=True)
    return dest


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    SEG.mkdir(parents=True, exist_ok=True)
    only = (sys.argv[1] if len(sys.argv) > 1 else "all").strip()
    if only in ("all", "canvas"):
        run_pack("canvas", ROOT / "canvas-30s", CANVAS)
    if only in ("all", "shortfilm"):
        run_pack("shortfilm", ROOT / "shortfilm-30s", SHORTFILM)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as e:
        print(f"FATAL {e}", flush=True)
        raise
