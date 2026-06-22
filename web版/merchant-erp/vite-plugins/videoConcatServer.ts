/**
 * 服务端多段 MP4 拼接（ffmpeg 子进程），供浏览器 wasm 失败时兜底。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fetchRemoteVideoBuffer } from './videoDownloadProxyCore.js'
import {
  resolveConcatNormalizeFilter,
  type VideoConcatNormalizeOpts,
} from '../src/lib/videoOutputScale.js'

const MAX_SEGMENT_BYTES = 80 * 1024 * 1024
const MAX_SEGMENTS = 12

export function bufferLooksLikeVideo(buf: Buffer): boolean {
  if (buf.length < 1024) return false
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true
  const limit = Math.min(buf.length - 4, 8192)
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0x66 && buf[i + 1] === 0x74 && buf[i + 2] === 0x79 && buf[i + 3] === 0x70) {
      return true
    }
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return true
  if (buf[0] === 0x47) return true
  return false
}

function resolveFfmpegBin(): string | null {
  const fromEnv = (process.env.MEOO_FFMPEG_PATH ?? '').trim()
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  const which = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' })
  const p = which.stdout?.trim()
  if (which.status === 0 && p) return p
  for (const c of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function runFfmpeg(bin: string, args: string[]): { ok: boolean; stderr: string } {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  const stderr = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim()
  return { ok: r.status === 0, stderr }
}

/** 将已下载到本地的多段视频 buffer 拼接（供 concat-blobs API 使用） */
export async function concatLocalMp4Buffers(
  buffers: Buffer[],
  opts?: VideoConcatNormalizeOpts,
): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; message: string }
> {
  if (buffers.length < 2) {
    return { ok: false, message: '至少需要 2 段视频。' }
  }
  if (buffers.length > MAX_SEGMENTS) {
    return { ok: false, message: `单次最多拼接 ${MAX_SEGMENTS} 段。` }
  }
  const ffmpeg = resolveFfmpegBin()
  if (!ffmpeg) {
    return {
      ok: false,
      message: '服务端未安装 ffmpeg，无法云端拼接。请在 ECS 执行：sudo apt-get install -y ffmpeg',
    }
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meoo-vconcat-blob-'))
  try {
    const localFiles: string[] = []
    for (let i = 0; i < buffers.length; i++) {
      const buf = buffers[i]!
      if (buf.length === 0) return { ok: false, message: `第 ${i + 1} 段视频为空` }
      if (buf.length > MAX_SEGMENT_BYTES) {
        return { ok: false, message: `第 ${i + 1} 段视频过大（>${MAX_SEGMENT_BYTES / 1024 / 1024}MB）` }
      }
      if (!bufferLooksLikeVideo(buf)) {
        return { ok: false, message: `第 ${i + 1} 段不是可识别的视频（${buf.length} 字节）` }
      }
      const fp = path.join(tmpDir, `s${i}.bin`)
      fs.writeFileSync(fp, buf)
      localFiles.push(fp)
    }

    const normalized: string[] = []
    const vf = opts ? resolveConcatNormalizeFilter(opts) : ''
    for (let i = 0; i < localFiles.length; i++) {
      const src = localFiles[i]!
      const norm = path.join(tmpDir, `n${i}.mp4`)
      const normArgs = ['-y', '-i', src]
      if (vf) normArgs.push('-vf', vf)
      normArgs.push(
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        norm,
      )
      const normRes = runFfmpeg(ffmpeg, normArgs)
      if (normRes.ok && fs.existsSync(norm) && fs.statSync(norm).size > 1024) {
        normalized.push(norm)
        continue
      }
      const copyNorm = path.join(tmpDir, `c${i}.mp4`)
      const copyRes = runFfmpeg(ffmpeg, ['-y', '-i', src, '-c', 'copy', '-movflags', '+faststart', copyNorm])
      if (copyRes.ok && fs.existsSync(copyNorm) && fs.statSync(copyNorm).size > 1024) {
        normalized.push(copyNorm)
        continue
      }
      return {
        ok: false,
        message: `第 ${i + 1} 段无法转为 MP4：${(normRes.stderr || copyRes.stderr).slice(-400)}`,
      }
    }

    const listPath = path.join(tmpDir, 'list.txt')
    const listTxt = normalized.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    fs.writeFileSync(listPath, listTxt, 'utf8')
    const outPath = path.join(tmpDir, 'out.mp4')
    const attempts: string[][] = [
      ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outPath],
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        outPath,
      ],
    ]
    let lastErr = 'ffmpeg 拼接失败'
    for (const args of attempts) {
      const r = runFfmpeg(ffmpeg, args)
      if (r.ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
        return { ok: true, buffer: fs.readFileSync(outPath) }
      }
      if (r.stderr) lastErr = r.stderr.slice(-600)
    }
    return { ok: false, message: lastErr }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '云端拼接异常' }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

/** 从本地 MP4 buffer 截取接近结尾的一帧（JPEG），供长视频分段衔接 */
export async function extractLastFrameJpegFromBuffer(
  videoBuf: Buffer,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  if (!videoBuf.length) return { ok: false, message: '视频为空' }
  if (videoBuf.length > MAX_SEGMENT_BYTES) {
    return { ok: false, message: `视频过大（>${MAX_SEGMENT_BYTES / 1024 / 1024}MB）` }
  }
  if (!bufferLooksLikeVideo(videoBuf)) {
    return { ok: false, message: `不是可识别的视频（${videoBuf.length} 字节）` }
  }
  const ffmpeg = resolveFfmpegBin()
  if (!ffmpeg) {
    return {
      ok: false,
      message: '服务端未安装 ffmpeg，无法截取尾帧。请在 ECS 执行：sudo apt-get install -y ffmpeg',
    }
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meoo-vlastframe-'))
  try {
    const videoPath = path.join(tmpDir, 'in.mp4')
    const outPath = path.join(tmpDir, 'frame.jpg')
    fs.writeFileSync(videoPath, videoBuf)
    const attempts: string[][] = [
      ['-y', '-sseof', '-0.15', '-i', videoPath, '-frames:v', '1', '-q:v', '2', outPath],
      ['-y', '-i', videoPath, '-vf', 'select=eq(n\\,0)', '-frames:v', '1', '-q:v', '2', outPath],
    ]
    let lastErr = 'ffmpeg 截取尾帧失败'
    for (const args of attempts) {
      const r = runFfmpeg(ffmpeg, args)
      if (r.ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 256) {
        return { ok: true, buffer: fs.readFileSync(outPath) }
      }
      if (r.stderr) lastErr = r.stderr.slice(-400)
    }
    return { ok: false, message: lastErr }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '截取尾帧异常' }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

export async function extractLastFrameJpegFromUrl(
  urlStr: string,
  opts?: { bearer?: string },
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  const fetched = await fetchRemoteVideoBuffer(urlStr, opts)
  if (!fetched.ok) return fetched
  return extractLastFrameJpegFromBuffer(fetched.buffer)
}

export async function concatRemoteMp4Urls(
  urls: string[],
  opts?: VideoConcatNormalizeOpts,
): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; message: string }
> {
  const list = urls.map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u))
  if (list.length < 2) {
    return { ok: false, message: '至少需要 2 个有效视频 URL。' }
  }
  if (list.length > MAX_SEGMENTS) {
    return { ok: false, message: `单次最多拼接 ${MAX_SEGMENTS} 段。` }
  }

  const ffmpeg = resolveFfmpegBin()
  if (!ffmpeg) {
    return {
      ok: false,
      message: '服务端未安装 ffmpeg，无法云端拼接。请在 ECS 执行：sudo apt-get install -y ffmpeg',
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meoo-vconcat-'))
  try {
    const localFiles: string[] = []
    for (let i = 0; i < list.length; i++) {
      const fetched = await fetchRemoteVideoBuffer(list[i]!)
      if (!fetched.ok) {
        return { ok: false, message: `下载第 ${i + 1} 段失败：${fetched.message}` }
      }
      const buf = fetched.buffer
      if (buf.length > MAX_SEGMENT_BYTES) {
        return { ok: false, message: `第 ${i + 1} 段视频过大（>${MAX_SEGMENT_BYTES / 1024 / 1024}MB）` }
      }
      const fp = path.join(tmpDir, `s${i}.bin`)
      fs.writeFileSync(fp, buf)
      localFiles.push(fp)
    }

    const normalized: string[] = []
    const vf = opts ? resolveConcatNormalizeFilter(opts) : ''
    for (let i = 0; i < localFiles.length; i++) {
      const src = localFiles[i]!
      const norm = path.join(tmpDir, `n${i}.mp4`)
      const normArgs = ['-y', '-i', src]
      if (vf) normArgs.push('-vf', vf)
      normArgs.push(
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        norm,
      )
      const normRes = runFfmpeg(ffmpeg, normArgs)
      if (normRes.ok && fs.existsSync(norm) && fs.statSync(norm).size > 1024) {
        normalized.push(norm)
        continue
      }
      const copyNorm = path.join(tmpDir, `c${i}.mp4`)
      const copyRes = runFfmpeg(ffmpeg, [
        '-y',
        '-i',
        src,
        '-c',
        'copy',
        '-movflags',
        '+faststart',
        copyNorm,
      ])
      if (copyRes.ok && fs.existsSync(copyNorm) && fs.statSync(copyNorm).size > 1024) {
        normalized.push(copyNorm)
        continue
      }
      return {
        ok: false,
        message: `第 ${i + 1} 段无法转为 MP4：${(normRes.stderr || copyRes.stderr).slice(-400)}`,
      }
    }

    const listPath = path.join(tmpDir, 'list.txt')
    const listTxt = normalized.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    fs.writeFileSync(listPath, listTxt, 'utf8')

    const outPath = path.join(tmpDir, 'out.mp4')
    const attempts: string[][] = [
      ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', outPath],
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        outPath,
      ],
    ]

    let lastErr = 'ffmpeg 拼接失败'
    for (const args of attempts) {
      const r = runFfmpeg(ffmpeg, args)
      if (r.ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
        return { ok: true, buffer: fs.readFileSync(outPath) }
      }
      if (r.stderr) lastErr = r.stderr.slice(-600)
    }

    return { ok: false, message: lastErr }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '云端拼接异常' }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

const MAX_MUX_VIDEO_BYTES = 80 * 1024 * 1024
const MAX_MUX_AUDIO_BYTES = 20 * 1024 * 1024

function probeMediaDurationSec(filePath: string): number | null {
  const ffmpeg = resolveFfmpegBin()
  if (!ffmpeg) return null
  try {
    const r = spawnSync(ffmpeg, ['-i', filePath, '-hide_banner'], { encoding: 'utf8' })
    const stderr = `${r.stderr ?? ''}${r.stdout ?? ''}`
    const m = stderr.match(/Duration:\s(\d+):(\d+):(\d+(?:\.\d+)?)/)
    if (!m) return null
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  } catch {
    return null
  }
}

function audioExtFromBuffer(buf: Buffer): string {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    return 'wav'
  }
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3'
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return 'mp3'
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'm4a'
  return 'mp3'
}

/** 将 TTS 口播 MP3 混入无声视频 MP4 */
export async function muxLocalVideoAudio(
  videoBuf: Buffer,
  audioBuf: Buffer,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  if (videoBuf.length < 1024) {
    return { ok: false, message: '视频文件过小或无效' }
  }
  if (audioBuf.length < 128) {
    return { ok: false, message: '口播音频过小或无效' }
  }
  if (videoBuf.length > MAX_MUX_VIDEO_BYTES) {
    return { ok: false, message: '视频文件过大，无法云端合成' }
  }
  if (audioBuf.length > MAX_MUX_AUDIO_BYTES) {
    return { ok: false, message: '口播音频过大，无法云端合成' }
  }

  const ffmpeg = resolveFfmpegBin()
  if (!ffmpeg) {
    return {
      ok: false,
      message: '服务端未安装 ffmpeg，无法云端合成音视频。请在 ECS 执行：sudo apt-get install -y ffmpeg',
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meoo-mux-'))
  const audioExt = audioExtFromBuffer(audioBuf)
  const videoPath = path.join(tmpDir, 'v.mp4')
  const audioPath = path.join(tmpDir, `a.${audioExt}`)
  const outPath = path.join(tmpDir, 'out.mp4')

  try {
    fs.writeFileSync(videoPath, videoBuf)
    fs.writeFileSync(audioPath, audioBuf)

    const videoDur = probeMediaDurationSec(videoPath)
    const audioDur = probeMediaDurationSec(audioPath)
    const padSec =
      videoDur != null &&
      audioDur != null &&
      videoDur > 0.2 &&
      audioDur > videoDur + 0.12
        ? Math.min(audioDur - videoDur, 120)
        : 0

    const attempts =
      padSec > 0
        ? [
            [
              '-y',
              '-i',
              videoPath,
              '-i',
              audioPath,
              '-filter_complex',
              `[0:v]tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}[vout]`,
              '-map',
              '[vout]',
              '-map',
              '1:a:0',
              '-c:v',
              'copy',
              '-c:a',
              'aac',
              '-b:a',
              '128k',
              '-movflags',
              '+faststart',
              outPath,
            ],
            [
              '-y',
              '-i',
              videoPath,
              '-i',
              audioPath,
              '-filter_complex',
              `[0:v]tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}[vout]`,
              '-map',
              '[vout]',
              '-map',
              '1:a:0',
              '-c:v',
              'libx264',
              '-preset',
              'veryfast',
              '-crf',
              '23',
              '-c:a',
              'aac',
              '-b:a',
              '128k',
              '-movflags',
              '+faststart',
              outPath,
            ],
          ]
        : [
          [
            '-y',
            '-i',
            videoPath,
            '-i',
            audioPath,
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-c:a',
            'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-movflags',
      '+faststart',
      outPath,
          ],
          [
            '-y',
            '-i',
            videoPath,
            '-i',
            audioPath,
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-crf',
            '23',
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-shortest',
            '-movflags',
            '+faststart',
            outPath,
          ],
        ]

    let lastErr = 'ffmpeg 音视频合成失败'
    for (const args of attempts) {
      const r = runFfmpeg(ffmpeg, args)
      if (r.ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
        return { ok: true, buffer: fs.readFileSync(outPath) }
      }
      if (r.stderr) lastErr = r.stderr.slice(-600)
    }

    return { ok: false, message: lastErr }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '云端音视频合成异常' }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function resolveCjkFontFile(): { path: string; fontName: string } | null {
  const fromEnv = (process.env.MEOO_FFMPEG_FONT_PATH ?? '').trim()
  if (fromEnv && fs.existsSync(fromEnv)) {
    return { path: fromEnv, fontName: cjkFontNameFromPath(fromEnv) }
  }
  const cwd = process.cwd()
  const candidates: Array<{ path: string; fontName: string }> = [
    { path: path.join(cwd, 'api/fonts/wqy-microhei.ttc'), fontName: 'WenQuanYi Micro Hei' },
    { path: path.join(cwd, 'api/fonts/NotoSansCJKsc-Regular.otf'), fontName: 'Noto Sans CJK SC' },
    { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', fontName: 'Noto Sans CJK SC' },
    { path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', fontName: 'Noto Sans CJK SC' },
    { path: '/usr/share/fonts/wqy-microhei/wqy-microhei.ttc', fontName: 'WenQuanYi Micro Hei' },
    { path: '/System/Library/Fonts/PingFang.ttc', fontName: 'PingFang SC' },
    { path: '/System/Library/Fonts/STHeiti Light.ttc', fontName: 'STHeiti' },
  ]
  for (const c of candidates) {
    if (fs.existsSync(c.path)) return c
  }
  return null
}

function cjkFontNameFromPath(fontPath: string): string {
  const base = path.basename(fontPath).toLowerCase()
  if (base.includes('wqy') || base.includes('microhei')) return 'WenQuanYi Micro Hei'
  if (base.includes('noto')) return 'Noto Sans CJK SC'
  if (base.includes('pingfang')) return 'PingFang SC'
  return 'WenQuanYi Micro Hei'
}

async function applyMotionTimelineToVideo(
  ffmpeg: string,
  videoPath: string,
  outPath: string,
  tmpDir: string,
  timeline: Array<{ startSec: number; endSec: number; gesturePreset: string }>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { subtleMotionFilterForGesture } = await import('../src/lib/digitalHumanPostProcessStyles.js')
  const audioPath = path.join(tmpDir, 'motion-audio.m4a')
  const audioR = runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    videoPath,
    '-vn',
    '-acodec',
    'copy',
    audioPath,
  ])
  const hasAudio = audioR.ok && fs.existsSync(audioPath) && fs.statSync(audioPath).size > 64

  const chunkPaths: string[] = []
  for (let i = 0; i < timeline.length; i++) {
    const seg = timeline[i]!
    const dur = Math.max(0.25, seg.endSec - seg.startSec)
    const chunkPath = path.join(tmpDir, `motion-seg-${i}.mp4`)
    const filter = subtleMotionFilterForGesture(seg.gesturePreset, '0:v')
    const r = runFfmpeg(ffmpeg, [
      '-y',
      '-ss',
      String(seg.startSec),
      '-i',
      videoPath,
      '-t',
      String(dur),
      '-filter_complex',
      filter,
      '-map',
      '[vzoom]',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      chunkPath,
    ])
    if (!r.ok || !fs.existsSync(chunkPath) || fs.statSync(chunkPath).size < 512) {
      return { ok: false, message: r.stderr.slice(-400) || `动作时段 ${i + 1} 处理失败` }
    }
    chunkPaths.push(chunkPath)
  }

  const listPath = path.join(tmpDir, 'motion-concat.txt')
  const listBody = chunkPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n')
  fs.writeFileSync(listPath, listBody, 'utf8')
  const videoOnlyPath = path.join(tmpDir, 'motion-video-only.mp4')
  const concatR = runFfmpeg(ffmpeg, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    videoOnlyPath,
  ])
  if (!concatR.ok || !fs.existsSync(videoOnlyPath)) {
    return { ok: false, message: concatR.stderr.slice(-400) || '动作片段拼接失败' }
  }

  if (hasAudio) {
    const muxR = runFfmpeg(ffmpeg, [
      '-y',
      '-i',
      videoOnlyPath,
      '-i',
      audioPath,
      '-c:v',
      'copy',
      '-c:a',
      'copy',
      '-shortest',
      outPath,
    ])
    if (!muxR.ok || !fs.existsSync(outPath)) {
      return { ok: false, message: muxR.stderr.slice(-400) || '动作成片音轨合并失败' }
    }
  } else {
    fs.copyFileSync(videoOnlyPath, outPath)
  }

  return { ok: true }
}

export type VideoPostProcessInput = {
  srtContent?: string
  subtitleStyle?: string
  productImageBuf?: Buffer
  /** 口型成片轻微推拉镜头，弥补无肢体动作 */
  subtleMotion?: boolean
  gesturePreset?: string
  /** 按时间段应用不同镜头运动（来自动作指令） */
  motionTimeline?: Array<{ startSec: number; endSec: number; gesturePreset: string }>
  /** 顶部 hook 大字（前约 4 秒） */
  hookTitle?: string
  /** 背景音乐 URL（公网可读 mp3/wav） */
  bgmUrl?: string
  /** BGM 相对口播音量，建议 0.12–0.2 */
  bgmVolume?: number
}

/** 成片后处理：产品图叠加 + SRT 字幕烧录（ffmpeg） */
export async function postProcessLocalVideo(
  videoBuf: Buffer,
  opts: VideoPostProcessInput,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  const srt = String(opts.srtContent ?? '').trim()
  const product = opts.productImageBuf
  const hasProduct = Boolean(product && product.length > 256)
  const subtleMotion = Boolean(opts.subtleMotion)
  const motionTimeline = Array.isArray(opts.motionTimeline)
    ? opts.motionTimeline.filter(
        (s) =>
          typeof s.startSec === 'number' &&
          typeof s.endSec === 'number' &&
          s.endSec > s.startSec &&
          String(s.gesturePreset || '').trim(),
      )
    : []
  const hasMotionTimeline = motionTimeline.length > 0
  const hookTitle = String(opts.hookTitle ?? '').trim()
  const hasHook = hookTitle.length > 0
  const bgmUrl = String(opts.bgmUrl ?? '').trim()
  const bgmVolume = typeof opts.bgmVolume === 'number' && opts.bgmVolume > 0 ? opts.bgmVolume : 0.15
  const hasBgm = Boolean(bgmUrl && /^https?:\/\//i.test(bgmUrl))
  if (!srt && !hasProduct && !subtleMotion && !hasMotionTimeline && !hasHook && !hasBgm) {
    return { ok: true, buffer: videoBuf }
  }
  if (videoBuf.length < 1024) {
    return { ok: false, message: '视频文件过小或无效' }
  }
  if (videoBuf.length > MAX_MUX_VIDEO_BYTES) {
    return { ok: false, message: '视频文件过大，无法云端后处理' }
  }

  const ffmpeg = resolveFfmpegBin()
  if (!ffmpeg) {
    return {
      ok: false,
      message: '服务端未安装 ffmpeg，无法烧录字幕/叠加产品图。请在 ECS 执行：sudo apt-get install -y ffmpeg fonts-noto-cjk',
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meoo-post-'))
  const videoPath = path.join(tmpDir, 'in.mp4')
  const outPath = path.join(tmpDir, 'out.mp4')
  const srtPath = path.join(tmpDir, 'sub.srt')
  const productPath = path.join(tmpDir, 'product.png')

  try {
    fs.writeFileSync(videoPath, videoBuf)
    if (srt) fs.writeFileSync(srtPath, `\ufeff${srt}`, 'utf8')
    if (hasProduct && product) fs.writeFileSync(productPath, product)

    let workingVideoPath = videoPath
    if (hasMotionTimeline) {
      const motionOut = path.join(tmpDir, 'motion-applied.mp4')
      const motionR = await applyMotionTimelineToVideo(ffmpeg, videoPath, motionOut, tmpDir, motionTimeline)
      if (!motionR.ok) return motionR
      workingVideoPath = motionOut
    }

    const filterParts: string[] = []
    let vLabel = '0:v'

    if (subtleMotion && !hasMotionTimeline) {
      const { subtleMotionFilterForGesture } = await import('../src/lib/digitalHumanPostProcessStyles.js')
      filterParts.push(subtleMotionFilterForGesture(opts.gesturePreset ?? 'emphasis', vLabel))
      vLabel = 'vzoom'
    }

    if (hasProduct) {
      filterParts.push('[1:v]scale=iw*0.42:-1[prod]')
      filterParts.push(`[${vLabel}][prod]overlay=(W-w)/2:H*0.55:format=auto[vprod]`)
      vLabel = 'vprod'
    }

    if (hasHook) {
      const { hookTitleDrawtextFilter } = await import('../src/lib/digitalHumanPostProcessStyles.js')
      const font = resolveCjkFontFile()
      filterParts.push(hookTitleDrawtextFilter(vLabel, hookTitle, font?.path))
      vLabel = 'vhook'
    }

    if (srt) {
      const { assForceStyleForSubtitle } = await import('../src/lib/digitalHumanPostProcessStyles.js')
      const styleKey = String(opts.subtitleStyle || 'bottom-white')
      let forceStyle = assForceStyleForSubtitle(styleKey)
      const font = resolveCjkFontFile()
      if (font) {
        forceStyle = `Fontname=${font.fontName},${forceStyle}`
      }
      const srtEsc = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
      const fontsDir = font ? path.dirname(font.path).replace(/\\/g, '/').replace(/:/g, '\\:') : ''
      const fontsDirOpt = fontsDir ? `:fontsdir='${fontsDir}'` : ''
      filterParts.push(
        `[${vLabel}]subtitles='${srtEsc}'${fontsDirOpt}:force_style='${forceStyle.replace(/'/g, "\\'")}'[vout]`,
      )
      vLabel = 'vout'
    }

    if (!filterParts.length && !hasBgm) {
      return { ok: true, buffer: fs.readFileSync(workingVideoPath) }
    }

    let processedBuf: Buffer
    if (!filterParts.length) {
      processedBuf = fs.readFileSync(workingVideoPath)
    } else {
      const filter = filterParts.join(';')
      const args = hasProduct
        ? ['-y', '-i', workingVideoPath, '-i', productPath, '-filter_complex', filter, '-map', `[${vLabel}]`, '-map', '0:a?', '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath]
        : ['-y', '-i', workingVideoPath, '-filter_complex', filter, '-map', `[${vLabel}]`, '-map', '0:a?', '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath]

      const r = runFfmpeg(ffmpeg, args)
      if (r.ok && fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
        processedBuf = fs.readFileSync(outPath)
      } else if (!hasBgm) {
        return { ok: false, message: r.stderr.slice(-600) || '成片后处理失败' }
      } else {
        processedBuf = fs.readFileSync(workingVideoPath)
      }
    }

    if (hasBgm) {
      const mixed = await mixBgmUnderVideoAudio(ffmpeg, tmpDir, processedBuf, bgmUrl, bgmVolume)
      if (!mixed.ok) return mixed
      return { ok: true, buffer: mixed.buffer }
    }

    return { ok: true, buffer: processedBuf }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '成片后处理异常' }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function fetchRemoteBgmBuffer(
  urlStr: string,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  try {
    const res = await fetch(urlStr, {
      headers: { Accept: 'audio/*,application/octet-stream,*/*', 'User-Agent': 'meoo-dh-bgm/1' },
    })
    if (!res.ok) return { ok: false, message: `BGM 下载失败 HTTP ${res.status}` }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 256) return { ok: false, message: 'BGM 文件过小或不可读' }
    if (buf.length > 12 * 1024 * 1024) return { ok: false, message: 'BGM 文件过大' }
    return { ok: true, buffer: buf }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'BGM 下载失败' }
  }
}

async function mixBgmUnderVideoAudio(
  ffmpeg: string,
  tmpDir: string,
  videoBuf: Buffer,
  bgmUrl: string,
  bgmVolume: number,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  const bgmFetch = await fetchRemoteBgmBuffer(bgmUrl)
  if (!bgmFetch.ok) return bgmFetch

  const videoPath = path.join(tmpDir, 'bgm-v.mp4')
  const bgmPath = path.join(tmpDir, `bgm-a.${audioExtFromBuffer(bgmFetch.buffer)}`)
  const outPath = path.join(tmpDir, 'bgm-out.mp4')
  fs.writeFileSync(videoPath, videoBuf)
  fs.writeFileSync(bgmPath, bgmFetch.buffer)

  const vol = Math.min(0.35, Math.max(0.05, bgmVolume))
  const filter = `[1:a]volume=${vol.toFixed(3)},aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`
  const args = [
    '-y',
    '-i',
    videoPath,
    '-i',
    bgmPath,
    '-filter_complex',
    filter,
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    outPath,
  ]
  const r = runFfmpeg(ffmpeg, args)
  if (!r.ok || !fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
    const fallbackArgs = [
      '-y',
      '-i',
      videoPath,
      '-i',
      bgmPath,
      '-filter_complex',
      filter,
      '-map',
      '0:v:0',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outPath,
    ]
    const r2 = runFfmpeg(ffmpeg, fallbackArgs)
    if (!r2.ok || !fs.existsSync(outPath) || fs.statSync(outPath).size < 1024) {
      return { ok: false, message: r2.stderr.slice(-400) || r.stderr.slice(-400) || 'BGM 混音失败' }
    }
  }
  return { ok: true, buffer: fs.readFileSync(outPath) }
}
