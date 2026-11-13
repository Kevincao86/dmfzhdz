/**
 * 模仿视频与网页版对齐的部分：抽帧拆时间轴、口播按成片时长铺开、背景乐取段拼接。
 * 达人小程序有一份相同副本，改逻辑时两边一起改。
 */

const RATE = 44100

function storyboardPrompt(who, shots) {
  return [
    `【形象锁定】参考图只锁定${who}的脸和衣服。成片必须是这个人出镜，禁止换成别人。`,
    '【分镜必演】按下面镜头顺序演完。口播必须说出来，要有环境声，禁止无声，禁止只出字幕。竖屏 9:16。',
    ...(shots || []).map(
      (s, i) =>
        `镜头${i + 1}（${s.startSec}–${s.endSec}秒）：画面：${s.visual || '沿用上一段场景'}。动作：${s.action || '按画面自然表演'}。口播：「${s.speech || ''}」。${s.hasBgm ? '这段有背景音。' : '这段不要背景音乐。'}`,
    ),
    '不要字幕、水印、Logo。',
  ].join('\n')
}

function motionPrompt(who, shots, voiceMode, bgmMode) {
  return [
    `将参考视频中的主要出镜人物替换为${who}，尽量使用全身或半身构图。`,
    '保持参考视频的动作、口型、运镜和场景。',
    ...(shots || []).map(
      (s, i) =>
        `镜头${i + 1} ${s.startSec}-${s.endSec}s：${s.visual}；人物${s.person || '主要出镜人物'}；动作${s.action}；口播「${s.speech || ''}」`,
    ),
    voiceMode === 'keep' ? '保留原片人声。' : '口播将在成片后替换为所选声音。',
    bgmMode === 'keep' ? '保留原片背景乐。' : '背景乐将替换为用户上传并裁好的音乐。',
  ].join('')
}

function fallbackShots(durationSec, speech) {
  const dur = Math.max(3, durationSec || 8)
  const parts = Math.min(4, Math.max(1, Math.ceil(dur / 4)))
  const step = dur / parts
  const lines = String(speech || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from({ length: parts }, (_, i) => ({
    id: `shot-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
    startSec: Math.round(i * step * 10) / 10,
    endSec: Math.round(Math.min(dur, (i + 1) * step) * 10) / 10,
    visual: `第 ${i + 1} 段画面`,
    person: '主要出镜人物',
    action: '沿用参考视频中的动作与口型',
    speech: lines[i] || (i === 0 ? String(speech || '') : ''),
    hasBgm: true,
  }))
}

function parseShots(text, durationSec, speechFallback) {
  const raw = String(text || '')
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return fallbackShots(durationSec, speechFallback)
  try {
    const arr = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(arr) || !arr.length) return fallbackShots(durationSec, speechFallback)
    return arr.slice(0, 8).map((item, i) => {
      const o = item && typeof item === 'object' ? item : {}
      return {
        id: `shot-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        startSec: Number(o.startSec) || i,
        endSec: Number(o.endSec) || i + 1,
        visual: String(o.visual || `第 ${i + 1} 段画面`),
        person: String(o.person || '主要出镜人物'),
        action: String(o.action || '沿用参考动作'),
        speech: String(o.speech || ''),
        hasBgm: o.hasBgm !== false,
      }
    })
  } catch (_) {
    return fallbackShots(durationSec, speechFallback)
  }
}

function shareAnalyzeContent(source) {
  return [
    '下面是一条短视频分享文案。不要下载视频，只整理成画面、口播、背景音。',
    '只返回 JSON 数组，2 到 4 项，字段：startSec,endSec,visual,action,speech,hasBgm。',
    'visual 写画面，action 写能演出来的动作，speech 写口播，hasBgm 表示这段有没有背景音。',
    source || '没有分享文案，请写一段可编辑的画面和口播。',
  ].join('\n')
}

function videoAnalyzeContent(dur, caption) {
  const sec = Number(dur) || 8
  return [
    `参考视频约 ${sec.toFixed(1)} 秒。按时间顺序拆成 2 到 4 个镜头。`,
    caption ? `分享文案：${String(caption).slice(0, 400)}` : '请根据画面写口播，看不清就留空。',
    '只返回 JSON 数组，每项字段：startSec,endSec,visual,action,speech,hasBgm。visual 是画面，action 是动作，speech 是口播，hasBgm 表示有没有背景音。',
  ].join('\n')
}

function sampleTimes(dur) {
  const sec = Number(dur) || 8
  const times = [0.4, sec * 0.35, sec * 0.68].filter((t) => t < sec - 0.1)
  return times.length ? times : [0.4]
}

function narrationWindows(rows, videoSec) {
  const spoken = (rows || []).filter((s) => String(s.speech || '').trim())
  if (!spoken.length || videoSec < 0.5) return []
  const planEnd = Math.max(
    0.5,
    ...spoken.map((s) => Number(s.endSec) || 0),
    ...spoken.map((s) => (Number(s.startSec) || 0) + 0.5),
  )
  const starts = spoken.map((s) => (Math.max(0, Number(s.startSec) || 0) / planEnd) * videoSec)
  return spoken.map((s, i) => ({
    start: starts[i] || 0,
    end: i + 1 < spoken.length ? Math.max((starts[i] || 0) + 0.35, starts[i + 1] || videoSec) : videoSec,
    speech: String(s.speech || '').trim(),
  }))
}

function labelClip(clip) {
  const startSec = Math.max(0, Number(clip.startSec) || 0)
  let endSec = Number(clip.endSec) || 0
  if (endSec < startSec + 0.2) endSec = startSec + 0.2
  return {
    ...clip,
    startSec,
    endSec,
    startLabel: startSec.toFixed(1),
    endLabel: endSec.toFixed(1),
  }
}

function updateClip(rows, id, patch) {
  return (rows || []).map((row) => (row.id === id ? labelClip({ ...row, ...patch }) : row))
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function once(fn) {
  let done = false
  return function settled(err, value) {
    if (done) return
    done = true
    fn(err, value)
  }
}

function readArrayBuffer(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      success: (res) => resolve(res.data),
      fail: (e) => reject(new Error((e && e.errMsg) || '读取音频失败')),
    })
  })
}

function writeBase64File(base64, ext) {
  const pure = String(base64 || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s/g, '')
  const path = `${wx.env.USER_DATA_PATH}/im-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext || 'mp3'}`
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath: path,
      data: pure,
      encoding: 'base64',
      success: () => resolve(path),
      fail: (e) => reject(new Error((e && e.errMsg) || '写入音频失败')),
    })
  })
}

function downloadTemp(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
        else reject(new Error('下载成片失败'))
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '下载成片失败')),
    })
  })
}

function decodeBuffer(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const finish = once((err, value) => (err ? reject(err) : resolve(value)))
    let ret
    try {
      ret = ctx.decodeAudioData(
        arrayBuffer,
        (buf) => finish(null, buf),
        (err) => finish(err || new Error('解码失败')),
      )
    } catch (e) {
      finish(e)
      return
    }
    if (ret && typeof ret.then === 'function') ret.then((buf) => finish(null, buf), (err) => finish(err))
  })
}

async function decodePath(ctx, path) {
  const data = await readArrayBuffer(path)
  return decodeBuffer(ctx, data)
}

function toMono(audioBuffer) {
  const n = audioBuffer.length
  const ch = Math.max(1, audioBuffer.numberOfChannels || 1)
  const out = new Float32Array(n)
  for (let c = 0; c < ch; c++) {
    const data = audioBuffer.getChannelData(c)
    for (let i = 0; i < n; i++) out[i] += (data[i] || 0) / ch
  }
  return { samples: out, rate: audioBuffer.sampleRate || RATE }
}

function resample(samples, fromRate, toRate) {
  if (!samples || !samples.length) return new Float32Array(0)
  if (fromRate === toRate) return samples
  const n = Math.max(1, Math.floor((samples.length * toRate) / fromRate))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const src = (i * fromRate) / toRate
    const i0 = Math.floor(src)
    const frac = src - i0
    const a = samples[i0] || 0
    const b = samples[Math.min(samples.length - 1, i0 + 1)] || a
    out[i] = a + (b - a) * frac
  }
  return out
}

function sliceMono(samples, rate, startSec, endSec) {
  const dur = samples.length / rate
  const start = Math.max(0, Math.min(Math.max(0, dur - 0.05), Number(startSec) || 0))
  const end = Math.max(start + 0.2, Math.min(dur, Number(endSec) || dur))
  const from = Math.floor(start * rate)
  const to = Math.max(from + 1, Math.floor(end * rate))
  return samples.subarray(from, Math.min(samples.length, to))
}

function addInto(dst, src, offset, gain) {
  if (!src || !src.length) return
  const g = Number(gain) || 0
  const start = Math.max(0, offset || 0)
  for (let i = 0; i < src.length && start + i < dst.length; i++) dst[start + i] += src[i] * g
}

/** 每段口播按自己的镜头时长变速，语速限制在 0.8–1.4，最后一段收到成片结尾。 */
function renderNarration(parts, videoSec) {
  const n = Math.max(1, Math.ceil(videoSec * RATE))
  const dst = new Float32Array(n)
  ;(parts || []).forEach((part) => {
    const samples = part.samples
    const srcRate = part.rate || RATE
    if (!samples || !samples.length) return
    const windowSec = Math.max(0.35, part.end - part.start)
    const srcSec = samples.length / srcRate
    const playback = Math.min(1.4, Math.max(0.8, srcSec / windowSec))
    const start = Math.floor(part.start * RATE)
    const end = Math.min(dst.length, Math.floor(part.end * RATE))
    for (let i = start; i < end; i++) {
      const srcIndex = ((i - start) / RATE) * playback * srcRate
      if (srcIndex >= samples.length) break
      const i0 = Math.floor(srcIndex)
      const frac = srcIndex - i0
      const a = samples[i0] || 0
      const b = samples[Math.min(samples.length - 1, i0 + 1)] || a
      dst[i] += a + (b - a) * frac
    }
  })
  return dst
}

function arrayBufferToBase64(buffer) {
  if (typeof wx !== 'undefined' && typeof wx.arrayBufferToBase64 === 'function') return wx.arrayBufferToBase64(buffer)
  const bytes = new Uint8Array(buffer)
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const triple = (a << 16) | (b << 8) | c
    out += table[(triple >> 18) & 63]
    out += table[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? table[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? table[triple & 63] : '='
  }
  return out
}

function encodeWavBase64(samples) {
  const n = samples.length
  const dataSize = n * 4
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const str = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 2, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 4, true)
  view.setUint16(32, 4, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0))
    const v = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(offset, v, true)
    view.setInt16(offset + 2, v, true)
    offset += 4
  }
  return arrayBufferToBase64(buffer)
}

function openAudio() {
  if (typeof wx.createWebAudioContext !== 'function') {
    throw new Error('当前微信版本不能混音，请升级微信后再试')
  }
  return wx.createWebAudioContext()
}

async function makeBgmClip(path, name) {
  const ctx = openAudio()
  let dur = 15
  try {
    const buf = await decodePath(ctx, path)
    const sec = buf.length / (buf.sampleRate || RATE)
    if (sec > 0.2) dur = sec
  } catch (_) {
    dur = 15
  } finally {
    try {
      ctx.close()
    } catch (_) {}
  }
  return labelClip({
    id: `bgm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: name || '音乐',
    path,
    durationSec: Math.round(dur * 10) / 10,
    startSec: 0,
    endSec: Math.round(Math.min(15, dur) * 10) / 10,
  })
}

function paintFrame(page, rgba, width, height) {
  return new Promise((resolve) => {
    if (!page || typeof page.createSelectorQuery !== 'function') {
      resolve('')
      return
    }
    page
      .createSelectorQuery()
      .select('#imitate-frame-canvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res && res[0] && res[0].node
        if (!canvas || !width || !height) {
          resolve('')
          return
        }
        const maxW = 360
        const scale = width > maxW ? maxW / width : 1
        const w = Math.max(2, Math.round(width * scale))
        const h = Math.max(2, Math.round(height * scale))
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        const img = ctx.createImageData(w, h)
        const src = new Uint8ClampedArray(rgba)
        for (let y = 0; y < h; y++) {
          const sy = Math.min(height - 1, Math.floor(y / scale))
          for (let x = 0; x < w; x++) {
            const sx = Math.min(width - 1, Math.floor(x / scale))
            const si = (sy * width + sx) * 4
            const di = (y * w + x) * 4
            img.data[di] = src[si] || 0
            img.data[di + 1] = src[si + 1] || 0
            img.data[di + 2] = src[si + 2] || 0
            img.data[di + 3] = 255
          }
        }
        ctx.putImageData(img, 0, 0)
        if (typeof canvas.toDataURL === 'function') {
          const url = String(canvas.toDataURL('image/jpeg', 0.72) || '')
          const comma = url.indexOf(',')
          resolve(comma >= 0 ? url.slice(comma + 1) : '')
          return
        }
        wx.canvasToTempFilePath({
          canvas,
          fileType: 'jpg',
          quality: 0.72,
          success: (file) => {
            wx.getFileSystemManager().readFile({
              filePath: file.tempFilePath,
              encoding: 'base64',
              success: (read) => resolve(String(read.data || '')),
              fail: () => resolve(''),
            })
          },
          fail: () => resolve(''),
        })
      })
  })
}

async function extractFrames(page, videoPath, times) {
  if (!videoPath || typeof wx.createVideoDecoder !== 'function') return []
  const decoder = wx.createVideoDecoder()
  const frames = []
  try {
    await new Promise((resolve, reject) => {
      const finish = once((err) => (err ? reject(err) : resolve()))
      const timer = setTimeout(() => finish(new Error('timeout')), 8000)
      decoder.on('start', () => {
        clearTimeout(timer)
        finish(null)
      })
      decoder.on('error', () => {
        clearTimeout(timer)
        finish(new Error('decoder'))
      })
      try {
        const started = decoder.start({ source: videoPath, mode: 1, abortAudio: true })
        if (started && typeof started.then === 'function') {
          started.then(
            () => {
              clearTimeout(timer)
              finish(null)
            },
            () => {
              clearTimeout(timer)
              finish(new Error('decoder'))
            },
          )
        }
      } catch (_) {
        clearTimeout(timer)
        finish(new Error('decoder'))
      }
    })
    const marks = (times || []).slice(0, 3)
    for (let i = 0; i < marks.length; i++) {
      try {
        decoder.seek(Math.round(marks[i] * 1000))
      } catch (_) {
        try {
          decoder.seek(marks[i])
        } catch (__) {}
      }
      await wait(240)
      let frame = null
      for (let n = 0; n < 4; n++) {
        try {
          frame = decoder.getFrameData()
        } catch (_) {
          frame = null
        }
        if (frame && frame.data && frame.width) break
        await wait(80)
      }
      if (!frame || !frame.data || !frame.width) continue
      const b64 = await paintFrame(page, frame.data, frame.width, frame.height)
      if (b64) frames.push(b64)
    }
  } catch (_) {
    return frames
  } finally {
    try {
      decoder.stop()
    } catch (_) {}
  }
  return frames
}

const ORIGINAL_AUDIO_ERR = '浏览器拆不出成片原声。请改用系统声音，或继续沿用原片背景乐。'

async function mixImitateAudio(opts) {
  const o = opts || {}
  const videoSec = Math.max(0.5, Number(o.videoSec) || 8)
  const voiceMode = o.voiceMode === 'preset' || o.voiceMode === 'clone' ? o.voiceMode : 'keep'
  const bgmMode = o.bgmMode === 'custom' ? 'custom' : 'keep'
  const clips = bgmMode === 'custom' ? o.bgmClips || [] : []
  const keepOriginal = voiceMode === 'keep' && bgmMode === 'custom' && clips.length > 0
  const windows = voiceMode === 'keep' ? [] : narrationWindows(o.shots, videoSec)
  if (!windows.length && !clips.length) throw new Error('没有可混入的口播或背景乐')
  const ctx = openAudio()
  try {
    const parts = []
    let cloneBase64 = ''
    if (voiceMode === 'clone' && typeof o.readCloneBase64 === 'function') cloneBase64 = await o.readCloneBase64()
    const voice = o.voice || {}
    for (let i = 0; i < windows.length; i++) {
      if (typeof o.onProgress === 'function') o.onProgress(`正在合成第 ${i + 1} 句口播…`)
      const spoken = await o.synthesize({
        text: windows[i].speech.slice(0, 200),
        voicePresetId: voiceMode === 'clone' ? 'v-clone' : voice.id,
        speechRate: Number(voice.rate) || 1,
        speechPitch: Number(voice.pitch) || 1,
        ...(cloneBase64 ? { referenceAudioBase64: cloneBase64 } : {}),
      })
      if (!spoken || !spoken.ok) throw new Error((spoken && spoken.message) || '语音合成失败')
      const path = await writeBase64File(spoken.audioBase64, 'mp3')
      const buf = await decodePath(ctx, path)
      const mono = toMono(buf)
      parts.push({ samples: mono.samples, rate: mono.rate, start: windows[i].start, end: windows[i].end })
    }
    const narration = parts.length ? renderNarration(parts, videoSec) : null
    let original = null
    if (keepOriginal) {
      if (typeof o.onProgress === 'function') o.onProgress('正在保留成片原声…')
      try {
        const videoPath = await downloadTemp(o.videoUrl)
        const buf = await decodePath(ctx, videoPath)
        const mono = toMono(buf)
        original = resample(mono.samples, mono.rate, RATE)
      } catch (_) {
        throw new Error(ORIGINAL_AUDIO_ERR)
      }
    }
    if (typeof o.onProgress === 'function' && clips.length) o.onProgress('正在按所选片段拼接背景乐…')
    const bgmPieces = []
    let bgmSamples = 0
    for (let i = 0; i < clips.length; i++) {
      const buf = await decodePath(ctx, clips[i].path)
      const mono = toMono(buf)
      const sliced = sliceMono(mono.samples, mono.rate, clips[i].startSec, clips[i].endSec)
      const atRate = resample(sliced, mono.rate, RATE)
      bgmPieces.push(atRate)
      bgmSamples += atRate.length
    }
    const total = Math.max(
      0.4,
      videoSec,
      narration ? videoSec : 0,
      bgmSamples / RATE,
      original ? original.length / RATE : 0,
    )
    const out = new Float32Array(Math.max(1, Math.ceil(total * RATE)))
    addInto(out, original, 0, 1)
    addInto(out, narration, 0, 1)
    const volume = Math.max(0, Math.min(1, Number(o.bgmVolume) || 0))
    let cursor = 0
    bgmPieces.forEach((piece) => {
      addInto(out, piece, cursor, volume)
      cursor += piece.length
    })
    return encodeWavBase64(out)
  } finally {
    try {
      ctx.close()
    } catch (_) {}
  }
}

module.exports = {
  storyboardPrompt,
  motionPrompt,
  parseShots,
  fallbackShots,
  shareAnalyzeContent,
  videoAnalyzeContent,
  sampleTimes,
  narrationWindows,
  labelClip,
  updateClip,
  makeBgmClip,
  extractFrames,
  mixImitateAudio,
  renderNarration,
  encodeWavBase64,
}
