/**
 * 服务端多段 MP4 拼接（ffmpeg 子进程），供浏览器 wasm 失败时兜底。
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const MAX_SEGMENT_BYTES = 80 * 1024 * 1024
const MAX_SEGMENTS = 12

function bufferLooksLikeVideo(buf: Buffer): boolean {
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
export async function concatLocalMp4Buffers(buffers: Buffer[]): Promise<
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
    for (let i = 0; i < localFiles.length; i++) {
      const src = localFiles[i]!
      const norm = path.join(tmpDir, `n${i}.mp4`)
      const normRes = runFfmpeg(ffmpeg, [
        '-y',
        '-i',
        src,
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
      ])
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

export async function concatRemoteMp4Urls(urls: string[]): Promise<
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
      const res = await fetch(list[i]!, {
        redirect: 'follow',
        headers: { 'User-Agent': 'meoo-merchant-erp-video-concat/1.0' },
      })
      if (!res.ok) {
        return { ok: false, message: `下载第 ${i + 1} 段失败 HTTP ${res.status}` }
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length === 0) {
        return { ok: false, message: `第 ${i + 1} 段视频为空` }
      }
      if (buf.length > MAX_SEGMENT_BYTES) {
        return { ok: false, message: `第 ${i + 1} 段视频过大（>${MAX_SEGMENT_BYTES / 1024 / 1024}MB）` }
      }
      if (!bufferLooksLikeVideo(buf)) {
        return {
          ok: false,
          message: `第 ${i + 1} 段不是可识别的视频（${buf.length} 字节），请重新生成`,
        }
      }
      const fp = path.join(tmpDir, `s${i}.bin`)
      fs.writeFileSync(fp, buf)
      localFiles.push(fp)
    }

    const normalized: string[] = []
    for (let i = 0; i < localFiles.length; i++) {
      const src = localFiles[i]!
      const norm = path.join(tmpDir, `n${i}.mp4`)
      const normRes = runFfmpeg(ffmpeg, [
        '-y',
        '-i',
        src,
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
      ])
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
