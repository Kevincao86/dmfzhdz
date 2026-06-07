/**
 * 浏览器端将多段 MP4 拼接为一段 MP4。
 * 多策略重试；exec 非零退出码不再误读缺失文件（避免 Emscripten FS 报 S3 error）。
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg'

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
function looksLikeVideoBytes(data: Uint8Array): boolean {
  if (data.length < 1024) return false
  if (hasFtypBox(data)) return true
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) return true
  if (data[0] === 0x47) return true
  return false
}

function isValidMp4(data: Uint8Array): boolean {
  return hasFtypBox(data)
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

async function loadFfmpeg(): Promise<FFmpeg> {
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

async function strategyNormalizeThenCopy(ffmpeg: FFmpeg, count: number): Promise<Uint8Array | null> {
  const normNames: string[] = []
  for (let i = 0; i < count; i++) {
    const norm = `n${i}.mp4`
    normNames.push(norm)
    const ok = await execOk(ffmpeg, [
      '-i',
      `c${i}.mp4`,
      '-vf',
      'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24',
      '-c:v',
      'mpeg4',
      '-q:v',
      '5',
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

async function strategyFilterConcat(ffmpeg: FFmpeg, count: number): Promise<Uint8Array | null> {
  const scales = Array.from({ length: count }, (_, i) =>
    `[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24[v${i}]`,
  ).join(';')
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
    '5',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    'out.mp4',
  ])
  if (!ok) return null
  return readOutputMp4(ffmpeg, 'out.mp4')
}

/** 浏览器 wasm 拼接 */
export async function concatVideoSegmentsToMp4(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error('没有可拼接的视频片段')
  if (blobs.length === 1) return blobs[0]!

  const ffmpeg = await loadFfmpeg()
  const workspace = ['files.txt', 'out.mp4']
  for (let i = 0; i < blobs.length; i++) {
    workspace.push(`c${i}.mp4`, `n${i}.mp4`)
  }
  await cleanupWorkspace(ffmpeg, workspace)

  await writeSegments(ffmpeg, blobs)

  const strategies = [
    () => strategyConcatCopy(ffmpeg, blobs.length),
    () => strategyNormalizeThenCopy(ffmpeg, blobs.length),
    () => strategyFilterConcat(ffmpeg, blobs.length),
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
