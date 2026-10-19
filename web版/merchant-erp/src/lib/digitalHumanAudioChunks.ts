/** 将口播音频按 wan2.2-s2v 单段时长上限（约 20s）切分为 WAV 片段 */

const MAX_S2V_AUDIO_SEC = 18

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : '')
    fr.onerror = () => reject(new Error('读取音频文件失败'))
    fr.readAsDataURL(file)
  })
}

function encodeWavFromAudioBuffer(buf: AudioBuffer, startSample: number, endSample: number): Blob {
  const channels = buf.numberOfChannels
  const sampleRate = buf.sampleRate
  const frameCount = Math.max(0, endSample - startSample)
  const bytesPerSample = 2
  const blockAlign = channels * bytesPerSample
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)

  const channelData: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    channelData.push(buf.getChannelData(c))
  }

  let offset = 44
  for (let i = startSample; i < endSample; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = channelData[c]![i] ?? 0
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export async function getAudioDurationSec(blob: Blob): Promise<number> {
  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) throw new Error('当前浏览器不支持音频解码')
  const ctx = new AC()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    return decoded.duration
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

/** 按秒数切分口播音频，供多段口型驱动 */
export async function splitAudioBlobForS2v(
  blob: Blob,
  maxSec = MAX_S2V_AUDIO_SEC,
): Promise<Blob[]> {
  if (blob.size < 128) throw new Error('口播音频过小或无效')

  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) throw new Error('当前浏览器不支持音频解码')
  const ctx = new AC()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const totalSamples = decoded.length
    const maxSamples = Math.max(1, Math.floor(maxSec * decoded.sampleRate))
    if (totalSamples <= maxSamples) return [blob]

    const segments: Blob[] = []
    for (let start = 0; start < totalSamples; start += maxSamples) {
      const end = Math.min(totalSamples, start + maxSamples)
      segments.push(encodeWavFromAudioBuffer(decoded, start, end))
    }
    return segments.length ? segments : [blob]
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

/**
 * 按动作时间轴切分一整段口播。时间戳按成片比例对齐真实音频长度，
 * 最后一段收到音频结尾，短于 1 秒的段并入相邻段。
 */
export async function splitAudioBlobByMotionBeats(
  blob: Blob,
  beats: Array<{ startSec: number; endSec: number; text: string }>,
): Promise<{ blobs: Blob[]; texts: string[] } | null> {
  const usable = beats.filter((b) => b.endSec > b.startSec && b.text.trim())
  if (usable.length < 2 || blob.size < 128) return null

  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) throw new Error('当前浏览器不支持音频解码')
  const ctx = new AC()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const duration = decoded.duration
    const lastEnd = usable[usable.length - 1]!.endSec
    const scale = lastEnd > 0.5 ? duration / lastEnd : 1
    const ranges: Array<{ start: number; end: number; text: string }> = []
    for (let i = 0; i < Math.min(8, usable.length); i++) {
      const b = usable[i]!
      const start = i === 0 ? 0 : Math.max(0, b.startSec * scale)
      const end = i === usable.length - 1 || i === 7 ? duration : Math.min(duration, b.endSec * scale)
      if (end - start < 1) {
        if (ranges.length) ranges[ranges.length - 1]!.end = end
        else ranges.push({ start: 0, end, text: b.text.trim() })
        continue
      }
      ranges.push({ start, end, text: b.text.trim() })
    }
    if (ranges.length < 2) return null
    const blobs: Blob[] = []
    const texts: string[] = []
    for (const r of ranges) {
      const startSample = Math.max(0, Math.floor(r.start * decoded.sampleRate))
      const endSample = Math.min(decoded.length, Math.floor(r.end * decoded.sampleRate))
      if (endSample - startSample < decoded.sampleRate) continue
      blobs.push(encodeWavFromAudioBuffer(decoded, startSample, endSample))
      texts.push(r.text)
    }
    if (blobs.length < 2) return null
    return { blobs, texts }
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

/** 多张环境照：把一整段口播均分成 count 段，每段对应一张场景。每段短于 1.2 秒则不切。 */
export async function splitAudioBlobIntoCount(blob: Blob, count: number): Promise<Blob[]> {
  const n = Math.max(1, Math.min(8, Math.round(count)))
  if (n <= 1 || blob.size < 128) return [blob]

  const AC = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) throw new Error('当前浏览器不支持音频解码')
  const ctx = new AC()
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer())
    const totalSamples = decoded.length
    const part = Math.floor(totalSamples / n)
    if (part < Math.floor(decoded.sampleRate * 1.2)) return [blob]
    const segments: Blob[] = []
    for (let i = 0; i < n; i++) {
      const start = i * part
      const end = i === n - 1 ? totalSamples : (i + 1) * part
      segments.push(encodeWavFromAudioBuffer(decoded, start, end))
    }
    return segments.length ? segments : [blob]
  } finally {
    await ctx.close().catch(() => undefined)
  }
}

export async function fileToAudioBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
    throw new Error('请上传 MP3、WAV 或 M4A 格式的口播音频')
  }
  if (file.size < 128) throw new Error('口播音频文件过小')
  if (file.size > 20 * 1024 * 1024) throw new Error('口播音频不能超过 20MB')
  return file
}

export async function blobToPureAudioBase64(blob: Blob): Promise<string> {
  const dataUrl = await readFileAsDataUrl(blob)
  const ix = dataUrl.indexOf('base64,')
  return ix >= 0 ? dataUrl.slice(ix + 'base64,'.length).replace(/\s/g, '') : dataUrl.replace(/\s/g, '')
}

export function estimateS2vSegmentCountFromDuration(durationSec: number, maxSec = MAX_S2V_AUDIO_SEC): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1
  return Math.max(1, Math.ceil(durationSec / maxSec))
}
