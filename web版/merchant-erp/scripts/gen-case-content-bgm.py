#!/usr/bin/env python3
"""按案例内容匹配、互不重复的 BGM 切片并 mux 到 short-video-cases。

依赖本机 ffmpeg；音源为 SoundHelix 示例曲（可商用演示）。
用法（仓库根）：
  python3 web版/merchant-erp/scripts/gen-case-content-bgm.py
"""
from __future__ import annotations

import hashlib
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASE_DIR = ROOT / "public/short-video-cases"
BGM_DIR = ROOT / "public/short-video-bgm"
TMP = Path("/tmp/case-bgm-unique")

# case_id -> (soundhelix_index, start_sec, volume, mood)
MAP = {
    "case-visit-night": (8, 12.0, 0.55, "夜市烟火"),
    "case-seed-skincare": (3, 8.0, 0.42, "护肤清透"),
    "case-promo-event": (7, 5.0, 0.60, "大促冲击"),
    "case-ambiance-cafe": (2, 20.0, 0.40, "咖啡馆慵懒"),
    "case-drama-hook": (11, 15.0, 0.48, "短剧悬念"),
    "case-food-ramen": (4, 10.0, 0.50, "拉面食欲"),
    "case-visit-brunch": (5, 6.0, 0.45, "早午餐明亮"),
    "case-seed-gadget": (12, 9.0, 0.48, "数码科技"),
    "case-hotpot": (1, 18.0, 0.55, "火锅热闹"),
    "case-bbq": (9, 14.0, 0.58, "烧烤街头"),
    "case-milktea": (6, 7.0, 0.46, "新茶饮甜感"),
    "case-hair": (13, 11.0, 0.44, "美发时尚"),
    "case-nail": (14, 8.0, 0.40, "美甲精致"),
    "case-gym": (10, 4.0, 0.62, "健身能量"),
    "case-hotel": (15, 22.0, 0.38, "酒店质感"),
    "case-kids": (16, 5.0, 0.50, "亲子欢快"),
    "case-pet": (17, 10.0, 0.42, "萌宠轻柔"),
    "case-takeaway": (1, 42.0, 0.50, "外卖家常"),
    "case-bakery": (2, 48.0, 0.48, "烘焙黄油"),
    "case-queue": (3, 40.0, 0.52, "城市游走"),
}


def download(idx: int) -> Path:
    TMP.mkdir(parents=True, exist_ok=True)
    out = TMP / f"SoundHelix-Song-{idx}.mp3"
    if out.exists() and out.stat().st_size > 100_000:
        return out
    url = f"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-{idx}.mp3"
    print("DL", idx)
    urllib.request.urlretrieve(url, out)
    return out


def main() -> None:
    BGM_DIR.mkdir(parents=True, exist_ok=True)
    for i in sorted({v[0] for v in MAP.values()}):
        download(i)
    ok = 0
    for cid, (idx, start, vol, mood) in MAP.items():
        mp4 = CASE_DIR / f"{cid}.mp4"
        if not mp4.exists():
            print("NO_VIDEO", cid)
            continue
        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nw=1:nk=1",
                str(mp4),
            ],
            capture_output=True,
            text=True,
        )
        try:
            vdur = float((probe.stdout or "5.1").strip() or 5.1)
        except ValueError:
            vdur = 5.1
        src = download(idx)
        bed = TMP / f"{cid}.m4a"
        fade = max(0.5, vdur - 0.7)
        r = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{start:.2f}",
                "-i",
                str(src),
                "-t",
                f"{vdur:.3f}",
                "-af",
                f"aresample=44100,volume={vol:.3f},afade=t=in:st=0:d=0.25,afade=t=out:st={fade:.3f}:d=0.65",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                str(bed),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if r.returncode != 0:
            print("BED_FAIL", cid)
            continue
        (BGM_DIR / f"{cid}.m4a").write_bytes(bed.read_bytes())
        tmp = mp4.with_suffix(".bgm.tmp.mp4")
        r2 = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(mp4),
                "-i",
                str(bed),
                "-map",
                "0:v:0",
                "-map",
                "1:a:0",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "160k",
                "-shortest",
                "-movflags",
                "+faststart",
                str(tmp),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if r2.returncode == 0 and tmp.exists() and tmp.stat().st_size > 50000:
            tmp.replace(mp4)
            ok += 1
            print(f"OK {cid} <- Song-{idx}@{start}s ({mood})")
        else:
            if tmp.exists():
                tmp.unlink()
            print("MUX_FAIL", cid)
    hashes: dict[str, list[str]] = {}
    for cid in MAP:
        wav = TMP / f"{cid}.chk.wav"
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(CASE_DIR / f"{cid}.mp4"),
                "-t",
                "2",
                "-vn",
                "-ac",
                "1",
                "-ar",
                "8000",
                str(wav),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if wav.exists():
            h = hashlib.md5(wav.read_bytes()).hexdigest()[:10]
            hashes.setdefault(h, []).append(cid)
    dups = [v for v in hashes.values() if len(v) > 1]
    print(f"DONE {ok}/{len(MAP)} unique={len(hashes)} dups={dups}")


if __name__ == "__main__":
    main()
