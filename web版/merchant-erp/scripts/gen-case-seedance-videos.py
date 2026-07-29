#!/usr/bin/env python3
"""用 Seedance 为案例墙生成真实短片（覆盖 Ken Burns 静帧）。"""
from __future__ import annotations

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
OUT = Path(__file__).resolve().parents[1] / "public" / "short-video-cases"

CASES = [
    (
        "case-visit-night",
        "9:16",
        "Night street food market in China, warm lantern glow, steam rising from stalls, handheld follow shot walking through crowd, continuous smooth camera motion, cinematic food vlog, photorealistic, no text",
    ),
    (
        "case-seed-skincare",
        "9:16",
        "Luxury skincare serum bottle rotating slowly on glass, soft pink light, liquid texture dripping, shallow depth of field, product commercial video, continuous camera orbit, photorealistic, no text",
    ),
    (
        "case-promo-event",
        "9:16",
        "Busy bright retail store interior, shoppers moving, festive warm lights, dynamic camera push-in through aisle, energetic commercial promo video, continuous motion, photorealistic, no logos or text",
    ),
    (
        "case-ambiance-cafe",
        "16:9",
        "Cozy cafe interior at dusk, steam from latte art, slow cinematic dolly past wooden tables and window light, brand atmosphere film, continuous camera motion, photorealistic, no text",
    ),
    (
        "case-drama-hook",
        "9:16",
        "Person opening apartment door at night looking surprised, cool hallway light, emotional close-up then pull back, suspenseful short drama hook, continuous camera motion, photorealistic, no text",
    ),
    (
        "case-food-ramen",
        "9:16",
        "Steaming tonkotsu ramen bowl, chopsticks lifting noodles with broth drip, rising steam, slow orbit macro food video, appetite cinematic, continuous motion, photorealistic, no text",
    ),
    (
        "case-visit-brunch",
        "9:16",
        "Sunny brunch cafe table, avocado toast and latte, natural window light, gentle push-in camera, lifestyle food video, continuous motion, photorealistic, no text",
    ),
    (
        "case-seed-gadget",
        "9:16",
        "Modern desk organizer with gadgets, cool blue ambient light, camera slowly orbiting product, tech product demo video, continuous motion, photorealistic, no text",
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
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read().decode("utf-8"))


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=180) as res, dest.open("wb") as f:
        while True:
            chunk = res.read(1024 * 256)
            if not chunk:
                break
            f.write(chunk)


def extract_poster(mp4: Path, png: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4),
            "-ss",
            "0.4",
            "-vframes",
            "1",
            "-q:v",
            "2",
            str(png),
        ],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def start(prompt: str, aspect: str) -> str:
    body = {
        "prompt": prompt,
        "flags": {
            "duration": 5,
            "aspect_ratio": aspect,
            "resolution": "720p",
            "fps": 24,
        },
        "model": MODEL,
        "skip_qwen": True,
    }
    j = http_json("POST", f"{API}/meoo-merchant-ai-video-seedance-start", body)
    if not j.get("ok") or not j.get("taskId"):
        raise RuntimeError(f"start failed: {j}")
    return str(j["taskId"])


def poll(task_id: str, label: str) -> str:
    for i in range(1, 61):
        qs = urllib.parse.urlencode({"taskId": task_id})
        j = http_json("GET", f"{API}/meoo-merchant-ai-video-seedance-status?{qs}")
        phase = j.get("phase")
        print(f"POLL {label} #{i} phase={phase}", flush=True)
        if phase == "succeeded" and j.get("videoUrl"):
            return str(j["videoUrl"])
        if phase == "failed" or j.get("ok") is False:
            raise RuntimeError(f"failed {label}: {j}")
        time.sleep(8)
    raise TimeoutError(f"timeout {label}")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    # 先全部发起，再轮询下载
    tasks: list[tuple[str, str]] = []
    for cid, aspect, prompt in CASES:
        try:
            tid = start(prompt, aspect)
            print(f"STARTED {cid} task={tid}", flush=True)
            tasks.append((cid, tid))
            time.sleep(1.2)
        except Exception as e:
            print(f"START_FAIL {cid}: {e}", flush=True)

    ok = 0
    for cid, tid in tasks:
        try:
            url = poll(tid, cid)
            mp4 = OUT / f"{cid}.mp4"
            png = OUT / f"{cid}.png"
            download(url, mp4)
            extract_poster(mp4, png)
            print(f"SAVED {cid} size={mp4.stat().st_size}", flush=True)
            ok += 1
        except Exception as e:
            print(f"POLL_FAIL {cid}: {e}", flush=True)

    print(f"DONE ok={ok}/{len(tasks)}", flush=True)
    return 0 if ok >= 4 else 1


if __name__ == "__main__":
    sys.exit(main())
