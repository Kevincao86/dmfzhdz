#!/usr/bin/env python3
"""为需要口播的案例：用 edge-tts（神经 TTS）生成口播，并与内容匹配 BGM 混音回写 mp4。

用法（仓库根 / merchant-erp）：
  python3 web版/merchant-erp/scripts/gen-case-narration-vo.py
"""
from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("请先: pip3 install --user edge-tts", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
CASE_DIR = ROOT / "public/short-video-cases"
BGM_DIR = ROOT / "public/short-video-bgm"
TMP = Path("/tmp/case-narration-vo")
TMP.mkdir(parents=True, exist_ok=True)

# 需口播案例：短句约 5 秒内读完；音色按场景切换
NARRATION: dict[str, tuple[str, str]] = {
    # id -> (voice, text)
    "case-visit-night": ("zh-CN-YunyangNeural", "夜市烟火气太足了，这家摊位必吃，人均只要三十块。"),
    "case-seed-skincare": ("zh-CN-XiaoxiaoNeural", "皮肤干起皮？三秒吸收，今晚限时买一送一。"),
    "case-promo-event": ("zh-CN-YunyangNeural", "周末满一百减三十，爆品闪购，现在到店就有！"),
    "case-drama-hook": ("zh-CN-YunjianNeural", "门铃响了，开门的瞬间……下一秒你绝对想不到。"),
    "case-visit-brunch": ("zh-CN-XiaoyiNeural", "周末早午餐探店，这口牛油果吐司真的绝了，赶紧预约。"),
    "case-seed-gadget": ("zh-CN-XiaoxiaoNeural", "桌面乱到爆？一个收纳盒搞定，桌面瞬间清爽。"),
    "case-hotpot": ("zh-CN-YunyangNeural", "红油翻滚，朋友局开起来，人均八十，必点毛肚鸭血。"),
    "case-bbq": ("zh-CN-YunjianNeural", "炭火滋滋响，夜宵撸串走起，就在巷口第二家。"),
    "case-milktea": ("zh-CN-XiaoxiaoNeural", "季节限定上新，第一口敲甜，活动价只要十五。"),
    "case-hair": ("zh-CN-XiaoyiNeural", "发型改造前后对比，出门回头率拉满，现在预约。"),
    "case-gym": ("zh-CN-YunyangNeural", "训练打卡不停，汗水见证成长，体验课限时开放。"),
    "case-kids": ("zh-CN-XiaoxiaoNeural", "周末遛娃好去处，安全好玩，套餐更划算。"),
    "case-takeaway": ("zh-CN-YunxiNeural", "外卖开箱看份量，第一口就上头，下单冲。"),
    "case-queue": ("zh-CN-YunjianNeural", "网红店周末排队，进门必点这道，避坑建议听我说。"),
}


async def synth(cid: str, voice: str, text: str) -> Path:
    out = TMP / f"{cid}-vo.mp3"
    communicate = edge_tts.Communicate(text, voice, rate="+8%")
    await communicate.save(str(out))
    return out


def probe_dur(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    try:
        return float((r.stdout or "5").strip() or 5)
    except ValueError:
        return 5.0


def mux(cid: str, vo: Path) -> bool:
    mp4 = CASE_DIR / f"{cid}.mp4"
    if not mp4.exists():
        print("NO_VIDEO", cid)
        return False
    vdur = probe_dur(mp4)
    bgm = BGM_DIR / f"{cid}.m4a"
    tmp = mp4.with_suffix(".vo.tmp.mp4")

    if bgm.exists():
        # 口播主声 + 背景音乐压低；对齐视频时长
        filt = (
            f"[1:a]aresample=44100,volume=1.15,afade=t=in:st=0:d=0.08[vo];"
            f"[2:a]aresample=44100,volume=0.22,afade=t=in:st=0:d=0.2,afade=t=out:st={max(0.4, vdur - 0.6):.2f}:d=0.55[bg];"
            f"[vo][bg]amix=inputs=2:duration=first:dropout_transition=0,atrim=0:{vdur:.3f},asetpts=PTS-STARTPTS[a]"
        )
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4),
            "-i",
            str(vo),
            "-i",
            str(bgm),
            "-filter_complex",
            filt,
            "-map",
            "0:v:0",
            "-map",
            "[a]",
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
        ]
    else:
        filt = f"[1:a]aresample=44100,volume=1.1,atrim=0:{vdur:.3f},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.08[a]"
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(mp4),
            "-i",
            str(vo),
            "-filter_complex",
            filt,
            "-map",
            "0:v:0",
            "-map",
            "[a]",
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
        ]

    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if r.returncode == 0 and tmp.exists() and tmp.stat().st_size > 50_000:
        tmp.replace(mp4)
        print(f"OK {cid} size={mp4.stat().st_size} dur≈{vdur:.1f}s")
        return True
    if tmp.exists():
        tmp.unlink()
    print("FAIL", cid, (r.stderr or "")[-220:])
    return False


async def main_async() -> int:
    ok = 0
    for cid, (voice, text) in NARRATION.items():
        print(f"TTS {cid} …", flush=True)
        try:
            vo = await synth(cid, voice, text)
        except Exception as e:
            print(f"TTS_FAIL {cid}: {e}")
            continue
        if mux(cid, vo):
            ok += 1
    print(f"DONE {ok}/{len(NARRATION)}")
    return 0 if ok >= max(1, len(NARRATION) // 2) else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_async()))
