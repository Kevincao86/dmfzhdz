/**
 * 浏览器端将多段 MP4 拼接为一段 MP4。
 * 多策略重试；exec 非零退出码不再误读缺失文件（避免 Emscripten FS 报 S3 error）。
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg'
import {
  resolveConcatNormalizeFilter,
  type VideoConcatNormalizeOpts,
} from './videoOutputScale'
import { probeVideoDurationSec } from './digitalHumanSubtitle'

const FFMPEG_CORE_VER = '0.12.10'

let ffmpegRef: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

function hasFtypBox(data: Uint8Array, maxScan = 8192): boolean {
  if (data.length < 12) return false
  if (data[4] === 0x66 && data[5] === 0x74 && data[6] === 0x79 && data[7] === 0x70) return true
  const limit = Math.min(data.length - 4, maxScan)
  for (let i = 0; i < limit; i++) {
    if (data[i] === 0x66 && data[i + 1] === 0x74 && data[i + 2] === 0x79 && data[i + 3] === 0x70) {
      return true
    }
  }
  return false
}

/** 豆包/可灵成片可能是 ftyp 非固定偏移或 WebM，交给 wasm ffmpeg 再规范化 */
export function looksLikeVideoBytes(data: Uint8Array): boolean {
  if (data.length < 1024) return false
  if (hasFtypBox(data)) return true
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return true
  if (data[0] === 0x47) return true
  return false
}

export async function assertBlobLooksLikeVideo(blob: Blob, label: string): Promise<Blob> {
  const head = new Uint8Array(await blob.slice(0, Math.min(blob.size, 8192)).arrayBuffer())
  if (looksLikeVideoBytes(head)) return blob
  throw new Error(
    `${label}不是有效视频文件（${blob.size} 字节），可能模型未返回 MP4，请重试或检查视频 API 配置`,
  )
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export async function loadFfmpeg(): Promise<FFmpeg> {
  if (ffmpegRef?.loaded) return ffmpegRef
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const { toBlobURL } = await import('@ffmpeg/util')
    const ffmpeg = new FFmpeg()

    const bases = [
      `${typeof window !== 'undefined' ? window.location.origin : ''}/ffmpeg`,
      `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VER}/dist/esm`,
    ].filter((b) => b.startsWith('http'))

    let lastErr = '无法加载视频拼接组件'
    for (const base of bases) {
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
        })
        ffmpegRef = ffmpeg
        return ffmpeg
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
      }
    }
    throw new Error(`${lastErr}。请刷新页面或检查网络后重试。`)
  })()

  return loadPromise
}

async function cleanupWorkspace(ffmpeg: FFmpeg, names: string[]): Promise<void> {
  for (const n of names) {
    try {
      await ffmpeg.deleteFile(n)
    } catch {
      /* ignore */
    }
  }
}

async function execOk(ffmpeg: FFmpeg, args: string[]): Promise<boolean> {
  const code = await ffmpeg.exec(args)
  return code === 0
}

async function readOutputMp4(ffmpeg: FFmpeg, outName: string): Promise<Uint8Array | null> {
  try {
    const raw = await ffmpeg.readFile(outName)
    if (!(raw instanceof Uint8Array) || raw.length < 1024 || !looksLikeVideoBytes(raw)) return null
    const copy = new Uint8Array(raw.length)
    copy.set(raw)
    return copy
  } catch {
    return null
  }
}

async function writeSegments(ffmpeg: FFmpeg, blobs: Blob[]): Promise<string[]> {
  const names: string[] = []
  for (let i = 0; i < blobs.length; i++) {
    const data = await blobToBytes(blobs[i]!)
    if (!looksLikeVideoBytes(data)) {
      throw new Error(`第 ${i + 1} 段不是可识别的视频文件，无法拼接`)
    }
    const name = `c${i}.mp4`
    await ffmpeg.writeFile(name, data)
    names.push(name)
  }
  return names
}

async function strategyConcatCopy(ffmpeg: FFmpeg, count: number): Promise<Uint8Array | null> {
  const listTxt = Array.from({ length: count }, (_, i) => `file 'c${i}.mp4'`).join('\n')
  await ffmpeg.writeFile('files.txt', listTxt)
  const ok = await execOk(ffmpeg, [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'files.txt',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    'out.mp4',
  ])
  if (!ok) return null
  return readOutputMp4(ffmpeg, 'out.mp4')
}

const FFMPEG_MPEG4_Q = '2'

async function strategyNormalizeThenCopy(
  ffmpeg: FFmpeg,
  count: number,
  vf: string,
): Promise<Uint8Array | null> {
  const normNames: string[] = []
  for (let i = 0; i < count; i++) {
    const norm = `n${i}.mp4`
    normNames.push(norm)
    const ok = await execOk(ffmpeg, [
      '-i',
      `c${i}.mp4`,
      '-vf',
      vf,
      '-c:v',
      'mpeg4',
      '-q:v',
      FFMPEG_MPEG4_Q,
      '-pix_fmt',
      'yuv420p',
      '-an',
      '-movflags',
      '+faststart',
      norm,
    ])
    if (!ok) return null
  }
  const listTxt = normNames.map((n) => `file '${n}'`).join('\n')
  await ffmpeg.writeFile('files.txt', listTxt)
  const ok = await execOk(ffmpeg, [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'files.txt',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    'out.mp4',
  ])
  if (!ok) return null
  return readOutputMp4(ffmpeg, 'out.mp4')
}

async function strategyFilterConcat(
  ffmpeg: FFmpeg,
  count: number,
  vf: string,
): Promise<Uint8Array | null> {
  const scales = Array.from({ length: count }, (_, i) => `[${i}:v]${vf}[v${i}]`).join(';')
  const concatIn = Array.from({ length: count }, (_, i) => `[v${i}]`).join('')
  const filter = `${scales};${concatIn}concat=n=${count}:v=1:a=0[vout]`

  const inputs: string[] = []
  for (let i = 0; i < count; i++) {
    inputs.push('-i', `c${i}.mp4`)
  }

  const ok = await execOk(ffmpeg, [
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[vout]',
    '-c:v',
    'mpeg4',
    '-q:v',
    FFMPEG_MPEG4_Q,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    'out.mp4',
  ])
  if (!ok) return null
  return readOutputMp4(ffmpeg, 'out.mp4')
}

/** 浏览器 wasm 拼接；opts 与用户选择的画面比例、帧率一致，避免长视频合成后尺寸不符 */
export async function concatVideoSegmentsToMp4(
  blobs: Blob[],
  opts?: VideoConcatNormalizeOpts,
): Promise<Blob> {
  if (blobs.length === 0) throw new Error('没有可拼接的视频片段')
  if (blobs.length === 1) return blobs[0]!

  const vf = resolveConcatNormalizeFilter(opts)
  const ffmpeg = await loadFfmpeg()
  const workspace = ['files.txt', 'out.mp4']
  for (let i = 0; i < blobs.length; i++) {
    workspace.push(`c${i}.mp4`, `n${i}.mp4`)
  }
  await cleanupWorkspace(ffmpeg, workspace)

  await writeSegments(ffmpeg, blobs)

  const strategies = [
    () => strategyConcatCopy(ffmpeg, blobs.length),
    () => strategyNormalizeThenCopy(ffmpeg, blobs.length, vf),
    () => strategyFilterConcat(ffmpeg, blobs.length, vf),
  ]

  for (const run of strategies) {
    await cleanupWorkspace(ffmpeg, ['files.txt', 'out.mp4'])
    for (let i = 0; i < blobs.length; i++) {
      await cleanupWorkspace(ffmpeg, [`n${i}.mp4`])
    }
    const out = await run()
    if (out) return new Blob([out.slice()], { type: 'video/mp4' })
  }

  throw new Error('浏览器拼接失败：片段编码不一致或内存不足，将尝试云端拼接')
}

/** 多段 MP3 拼接为一条口播音轨 */
export async function concatAudioMp3Blobs(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('没有可拼接的音频')
  if (blobs.length === 1) return blobs[0]!

  const ffmpeg = await loadFfmpeg()
  const workspace = ['out.mp3']
  for (let i = 0; i < blobs.length; i++) workspace.push(`a${i}.mp3`)
  await cleanupWorkspace(ffmpeg, workspace)

  for (let i = 0; i < blobs.length; i++) {
    await ffmpeg.writeFile(`a${i}.mp3`, await blobToBytes(blobs[i]!))
  }

  const inputs = blobs.flatMap((_, i) => ['-i', `a${i}.mp3`])
  const filter = `${blobs.map((_, i) => `[${i}:a]`).join('')}concat=n=${blobs.length}:v=0:a=1[aout]`
  const ok = await execOk(ffmpeg, [
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[aout]',
    '-c:a',
    'libmp3lame',
    '-q:a',
    '4',
    'out.mp3',
  ])
  if (!ok) throw new Error('口播音频拼接失败')

  try {
    const raw = await ffmpeg.readFile('out.mp3')
    if (typeof raw === 'string') throw new Error('read_failed')
    return new Blob([raw.slice()], { type: 'audio/mpeg' })
  } catch {
    throw new Error('口播音频拼接失败')
  }
}

function audioWorkspaceName(mime: string, head: Uint8Array): string {
  const m = mime.toLowerCase()
  if (m.includes('wav')) return 'a.wav'
  if (m.includes('mp4') || m.includes('m4a')) return 'a.m4a'
  if (head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) {
    return 'a.wav'
  }
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return 'a.mp3'
  if (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) return 'a.mp3'
  return 'a.mp3'
}

function probeAudioDurationSec(blob: Blob): Promise<number> {
  const url = URL.createObjectURL(blob)
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.onloadedmetadata = () => {
      const d = a.duration
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(d) && d > 0 ? d : 0)
    }
    a.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    a.src = url
  })
}

/** 将 TTS 口播音轨混入无声视频 MP4；口播长于画面时延长末帧，不裁音频 */
export async function muxAudioWithVideoBlob(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  if (audioBlob.size < 128) throw new Error('口播音频为空，无法合成')

  const audioHead = new Uint8Array(await audioBlob.slice(0, 16).arrayBuffer())
  const audioName = audioWorkspaceName(audioBlob.type || 'audio/mpeg', audioHead)

  const videoDur = await probeVideoDurationSec(videoBlob)
  const audioDur = await probeAudioDurationSec(audioBlob)
  const padSec =
    videoDur > 0.2 && audioDur > videoDur + 0.12 ? Math.min(audioDur - videoDur, 120) : 0

  const ffmpeg = await loadFfmpeg()
  await cleanupWorkspace(ffmpeg, ['v.mp4', 'a.mp3', 'a.wav', 'a.m4a', 'out.mp4'])
  await ffmpeg.writeFile('v.mp4', await blobToBytes(videoBlob))
  await ffmpeg.writeFile(audioName, await blobToBytes(audioBlob))

  const tailCommon = [
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    'out.mp4',
  ] as const

  const strategies =
    padSec > 0
      ? [
          [
            '-filter_complex',
            `[0:v]tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}[vout]`,
            '-map',
            '[vout]',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            ...tailCommon,
          ],
          [
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
            ...tailCommon,
          ],
        ]
      : [
          [
            '-map',
            '0:v:0',
            '-map',
            '1:a:0',
            '-c:v',
            'copy',
            '-shortest',
            ...tailCommon,
          ],
          [
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
            '-shortest',
            ...tailCommon,
          ],
        ]

  for (const tail of strategies) {
    const ok = await execOk(ffmpeg, ['-y', '-i', 'v.mp4', '-i', audioName, ...tail])
    if (!ok) continue
    const out = await readOutputMp4(ffmpeg, 'out.mp4')
    if (out) return new Blob([out.slice()], { type: 'video/mp4' })
  }

  throw new Error('浏览器音视频合成失败，将尝试云端合成')
}

/** 检测 MP4 是否含可提取音轨（混音结果验收） */
export async function probeVideoHasAudioStream(blob: Blob): Promise<boolean> {
  if (blob.size < 2048) return false
  try {
    const ffmpeg = await loadFfmpeg()
    await cleanupWorkspace(ffmpeg, ['in.mp4', 'a.m4a'])
    await ffmpeg.writeFile('in.mp4', await blobToBytes(blob))
    const ok = await execOk(ffmpeg, ['-y', '-i', 'in.mp4', '-vn', '-acodec', 'copy', 'a.m4a'])
    if (!ok) return false
    const raw = await ffmpeg.readFile('a.m4a')
    return typeof raw !== 'string' && raw.length > 128
  } catch {
    return false
  }
}

/**
 * 口播优先完整保留：浏览器 wasm 混音优先，云端 ffmpeg 兜底；验收无音轨则换路径重试。
 */
export async function muxVideoWithNarrationPreferBrowser(
  videoBlob: Blob,
  audioBlob: Blob,
  serverMux: (video: Blob, audio: Blob) => Promise<Blob>,
): Promise<Blob> {
  if (audioBlob.size < 128) throw new Error('口播音频为空，无法合成')

  const audioDur = await probeAudioDurationSec(audioBlob)
  if (audioDur <= 0) throw new Error('口播音频无法播放，请检查音色配置或重新试听')

  const tryOnce = async (label: string, fn: () => Promise<Blob>): Promise<Blob> => {
    const out = await fn()
    const hasAudio = await probeVideoHasAudioStream(out)
    if (!hasAudio) {
      throw new Error(`${label} 合成结果无音轨`)
    }
    return out
  }

  let browserErr = ''
  try {
    return await tryOnce('浏览器', () => muxAudioWithVideoBlob(videoBlob, audioBlob))
  } catch (e) {
    browserErr = e instanceof Error ? e.message : String(e)
  }

  try {
    return await tryOnce('云端', () => serverMux(videoBlob, audioBlob))
  } catch (serverErr) {
    const s = serverErr instanceof Error ? serverErr.message : String(serverErr)
    throw new Error(`浏览器合成：${browserErr || '失败'}；云端合成：${s}`)
  }
}
