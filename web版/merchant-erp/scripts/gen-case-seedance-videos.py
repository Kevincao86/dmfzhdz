#!/usr/bin/env python3
"""用 Seedance 为案例墙生成真实短片；默认只生成尚无 mp4 的案例。"""
from __future__ import annotations

import json
import os
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

# 全部案例；脚本会跳过已有 mp4（除非 FORCE=1）
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
        "Bright clothing boutique store interior, shoppers walking through aisle, festive warm lights, dynamic camera push-in, energetic commercial atmosphere video, continuous motion, photorealistic",
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
    (
        "case-hotpot",
        "9:16",
        "Cozy Chinese restaurant table at night, large metal soup pot steaming, vegetables and tofu cooking, warm orange lights, slow camera orbit, food commercial video, photorealistic, no text",
    ),
    (
        "case-bbq",
        "9:16",
        "Night barbecue grill with charcoal flames, skewers sizzling, warm street lights, handheld food vlog motion, photorealistic, no text",
    ),
    (
        "case-milktea",
        "9:16",
        "Colorful bubble tea cup spinning slowly, fresh fruit toppings, bright shop background, product commercial camera orbit, photorealistic, no text",
    ),
    (
        "case-hair",
        "9:16",
        "Modern hair salon, stylist cutting hair, mirror reflection, before-after transformation vibe, continuous camera motion, photorealistic, no text",
    ),
    (
        "case-nail",
        "9:16",
        "Close-up of elegant manicure nails under soft salon light, slow orbit macro shot, beauty commercial video, photorealistic, no text",
    ),
    (
        "case-gym",
        "9:16",
        "Modern gym workout, person lifting weights, energetic camera follow, sweat and motion, fitness commercial video, photorealistic, no text",
    ),
    (
        "case-hotel",
        "9:16",
        "Boutique hotel room door opening to bright window view, slow dolly across bed and decor, luxury stay atmosphere, photorealistic, no text",
    ),
    (
        "case-kids",
        "9:16",
        "Colorful indoor kids playground, children playing happily, bright safe atmosphere, gentle camera motion, photorealistic, no text",
    ),
    (
        "case-pet",
        "9:16",
        "Cute cat cafe interior, fluffy cats lounging, soft warm light, gentle camera follow, adorable lifestyle video, photorealistic, no text",
    ),
    (
        "case-takeaway",
        "9:16",
        "Unboxing takeaway food bags on a dining table, opening containers, appetizing steam, top-down then close-up motion, photorealistic, no text",
    ),
    (
        "case-bakery",
        "9:16",
        "Fresh bakery bread coming out of oven with steam, knife slicing soft crumb, warm bakery light, continuous food video motion, photorealistic, no text",
    ),
    (
        "case-queue",
        "9:16",
        "People queueing outside a popular restaurant on a sunny street, camera moving along the line then into entrance, lifestyle city vlog, photorealistic, no text",
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


def compress_web(mp4: Path) -> None:
    """H.264 + AAC + faststart；保留音轨。目标 1080 短边内、24fps（勿再压成 480p）。"""
    tmp = mp4.with_suffix(".web.tmp.mp4")
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(mp4),
        ],
        capture_output=True,
        text=True,
    )
    has_audio = "audio" in (probe.stdout or "")
    # 竖屏宽≤1080、横屏宽≤1920；偶数对齐，保留高清
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(mp4),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "23",
        "-vf",
        "scale=w='if(gt(iw\\,ih)\\,min(1920\\,iw)\\,min(1080\\,iw))':h=-2",
        "-r",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
    ]
    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ac", "2"]
    else:
        cmd += ["-an"]
    cmd.append(str(tmp))
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 10_000:
        tmp.replace(mp4)
        print(f"COMPRESSED {mp4.name} size={mp4.stat().st_size} audio={has_audio}", flush=True)
    else:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        print(f"COMPRESS_SKIP {mp4.name}", flush=True)


def start(prompt: str, aspect: str) -> str:
    body = {
        "prompt": prompt,
        "flags": {
            "duration": 5,
            "aspect_ratio": aspect,
            "resolution": "1080p",
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
    force = os.environ.get("FORCE", "") == "1"
    compress_only = os.environ.get("COMPRESS_ONLY", "") == "1"

    if compress_only:
        for mp4 in sorted(OUT.glob("*.mp4")):
            compress_web(mp4)
            png = mp4.with_suffix(".png")
            if not png.exists() or png.stat().st_size < 1000:
                extract_poster(mp4, png)
        return 0

    pending = []
    for cid, aspect, prompt in CASES:
        mp4 = OUT / f"{cid}.mp4"
        if mp4.exists() and mp4.stat().st_size > 100_000 and not force:
            print(f"SKIP_EXISTS {cid}", flush=True)
            continue
        pending.append((cid, aspect, prompt))

    print(f"PENDING {len(pending)}", flush=True)
    tasks: list[tuple[str, str]] = []
    for cid, aspect, prompt in pending:
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
            compress_web(mp4)
            extract_poster(mp4, png)
            print(f"SAVED {cid} size={mp4.stat().st_size}", flush=True)
            ok += 1
        except Exception as e:
            print(f"POLL_FAIL {cid}: {e}", flush=True)

    if ok:
        print(
            "NOTE: 成片已落盘。请再跑口播/BGM 混音：\n"
            "  python3 scripts/gen-case-content-bgm.py\n"
            "  python3 scripts/gen-case-narration-vo.py",
            flush=True,
        )

    print(f"DONE ok={ok}/{len(tasks)} pending_started={len(tasks)}", flush=True)
    # 有待生成时至少成功一半；无待生成则成功
    if not tasks:
        return 0
    return 0 if ok >= max(1, len(tasks) // 2) else 1


if __name__ == "__main__":
    sys.exit(main())
