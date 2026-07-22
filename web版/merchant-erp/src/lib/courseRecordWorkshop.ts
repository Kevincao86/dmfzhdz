/**
 * 录播工坊：口播稿解析与时间轴导出（半自动录屏）
 */
import { postAiChat } from '../services/ai/aiClient'

export type CourseRecordPage = {
  pageNo: number
  title: string
  script: string
}

/** 解析「### 第 N 页 · 标题」格式口播稿；无匹配时按空行分块 */
export function parseOralScriptMarkdown(raw: string): CourseRecordPage[] {
  const text = String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!text) return []

  const headingRe = /^###\s*第\s*(\d+)\s*页(?:\s*[·•.\-—]\s*(.+))?$/gm
  const hits: { pageNo: number; title: string; index: number; endTitle: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(text)) != null) {
    hits.push({
      pageNo: Number(m[1]),
      title: String(m[2] || '').trim() || `第 ${m[1]} 页`,
      index: m.index,
      endTitle: m.index + m[0].length,
    })
  }

  if (hits.length > 0) {
    return hits
      .map((h, i) => {
        const bodyStart = h.endTitle
        const bodyEnd = i + 1 < hits.length ? hits[i + 1]!.index : text.length
        const script = text
          .slice(bodyStart, bodyEnd)
          .replace(/^[\s>\-*]+/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
        return { pageNo: h.pageNo, title: h.title, script }
      })
      .filter((p) => p.script.length > 0 || p.title)
  }

  const blocks = text
    .split(/\n{2,}|(?:\n---+\n)/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks.map((block, i) => {
    const lines = block.split('\n')
    const first = lines[0]!.replace(/^#+\s*/, '').trim()
    const rest = lines.slice(1).join('\n').trim()
    if (rest) {
      return { pageNo: i + 1, title: first.slice(0, 40), script: rest }
    }
    return { pageNo: i + 1, title: `第 ${i + 1} 页`, script: first }
  })
}

export function pagesToOralMarkdown(pages: CourseRecordPage[]): string {
  return pages
    .map((p) => `### 第 ${p.pageNo} 页 · ${p.title}\n${p.script.trim()}`)
    .join('\n\n')
}

function stripJsonFence(raw: string): string {
  const t = raw.trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m?.[1] ?? t).trim()
}

function pagesFromAiJson(content: string): CourseRecordPage[] | null {
  const cleaned = stripJsonFence(content)
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const arr = cleaned.match(/\[[\s\S]*\]/)
    if (!arr) return null
    try {
      parsed = JSON.parse(arr[0])
    } catch {
      return null
    }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { pages?: unknown }).pages)
      ? (parsed as { pages: unknown[] }).pages
      : null
  if (!list?.length) return null
  const out: CourseRecordPage[] = []
  list.forEach((row, i) => {
    if (!row || typeof row !== 'object') return
    const o = row as Record<string, unknown>
    const script = String(o.script ?? o.text ?? o.content ?? '').trim()
    if (!script) return
    const pageNo = Number(o.pageNo ?? o.page ?? o.index ?? i + 1)
    const title = String(o.title ?? o.name ?? `第 ${pageNo} 页`).trim() || `第 ${pageNo} 页`
    out.push({
      pageNo: Number.isFinite(pageNo) && pageNo > 0 ? Math.floor(pageNo) : i + 1,
      title: title.slice(0, 48),
      script,
    })
  })
  return out.length ? out : null
}

const AI_PARSE_SYSTEM = `你是录播课口播稿分页助手。把用户给出的口播/讲稿按「幻灯页」切成多页。
只输出 JSON（不要 Markdown 说明），结构：
{"pages":[{"pageNo":1,"title":"封面","script":"该页完整口播正文"},...]}
规则：
1. 若原文已有「第 N 页」标题，优先按此切分并保留语意标题。
2. 若无页码，按话题/段落合理分页，每页口播约 30～120 字为宜，勿过碎。
3. script 为可直接朗读的完整中文，去掉「讲师备注」类旁注。
4. pageNo 从 1 连续递增。`

/** AI 模型解析分页；失败抛错由调用方回退规则解析 */
export async function parseOralScriptWithAi(raw: string): Promise<CourseRecordPage[]> {
  const text = String(raw || '').trim()
  if (!text) throw new Error('口播稿为空')
  const res = await postAiChat({
    provider: 'doubao',
    temperature: 0.2,
    messages: [
      { role: 'system', content: AI_PARSE_SYSTEM },
      {
        role: 'user',
        content: `请解析下列口播稿并分页：\n\n${text.slice(0, 14000)}`,
      },
    ],
  })
  const pages = pagesFromAiJson(res.content || '')
  if (!pages?.length) throw new Error('模型未返回有效分页 JSON')
  return pages.map((p, i) => ({ ...p, pageNo: i + 1 }))
}

export function estimateSpeechSec(script: string): number {
  const chars = script.replace(/\s/g, '').length
  return Math.max(3, Math.round((chars / 4.2) * 10) / 10)
}

export function formatTimelineChecklist(
  pages: CourseRecordPage[],
  meta?: { courseTitle?: string; voiceLabel?: string },
): string {
  const title = meta?.courseTitle?.trim() || '录播课'
  const voice = meta?.voiceLabel?.trim() || '未指定音色'
  const lines = [
    `# ${title} · 录屏时间轴清单`,
    '',
    `音色：${voice}`,
    '用法：另窗打开 PPT 全屏 → OBS 录该窗 → 本工坊点「开始导播」播音；听到提示后翻 PPT 到对应页。',
    '',
    '| 页 | 标题 | 预估秒 | 音频文件 |',
    '|----|------|--------|----------|',
  ]
  let t = 0
  for (const p of pages) {
    const sec = estimateSpeechSec(p.script)
    const start = t
    t += sec + 0.8
    lines.push(
      `| ${p.pageNo} | ${p.title.replace(/\|/g, '/')} | ~${sec}s（起 ${start.toFixed(0)}s） | page-${String(p.pageNo).padStart(2, '0')}.mp3 |`,
    )
  }
  lines.push('', `合计约 ${Math.ceil(t)} 秒（含页间停顿）`, '')
  return lines.join('\n')
}

/** 开场白总目录示例（与 html-讲义开场白对齐，可替换） */
export const SAMPLE_OPENING_ORAL_SCRIPT = `### 第 1 页 · 封面
家人们好。欢迎来到灵祺星选商家 ERP 月订阅课程。这一页是口播稿总目录的展示 PPT——开课前我们先把整包课的地图过一遍。

### 第 2 页 · 今天开场
开课前不急着点功能。今天只要带走三件事：学什么、怎么学、怎么练。

### 第 3 页 · 怎么用
录播用法就三步：打开讲义进对应课；同目录打开口播稿按页念；赶进度先念一口气版，再补演示。

### 第 4 页 · 九子项目
九个子项目一张图装下：开营、上手、AI、达人、内容、获客、财务、月更，外加四周直播。

### 第 5 页 · 模块0-1
入门段：模块零讲清为什么累、ERP 省什么、怎么学；模块一走通登录门店看板权益。正式学员务必完成零点三和一点四。

### 第 6 页 · 模块2
核心能力在模块二：九大场景、预览确认、组品、Brief、差评，最后实操产出。AI 可以写草稿，签字确认还是你。

### 第 7 页 · 模块3
钱最容易打水漂的地方——找达人。从为什么亏讲到发单、档位、履约、结款，最后发一单测试招募。

### 第 8 页 · 模块4-5
内容产能与曝光获客：能产出，还能跟进，才叫闭环。

### 第 9 页 · 模块6-7
财务盘点与月更专题：订阅不是听完就扔，每月有专题加深。

### 第 10 页 · 四周直播
四周直播，把「会」变成「做过」：组品、发招募、口播混剪、线索复盘。

### 第 11 页 · 学练用
月订阅等于学加练加用。散点经营一定累；流水线才省人、省口径、省月底扯皮。

### 第 12 页 · 课表速览
整包大约四十堂课，按模块推进。完整链接表见口播稿总目录。

### 第 13 页 · 今天带走
先看地图再进单课；录播对着按页口播念；正式学员先完成零点三和一点四。

### 第 14 页 · 结束
好地图讲完了。下一页进入模块零——建议首课零点一。我们正式开始。
`

export const VOICE_PREVIEW_FALLBACK =
  '大家好，这是灵祺录播工坊的口播音色试听，请确认音量与语速是否合适。'

/** 从文件名解析页码：page-01 / p12 / 第3页 / 01 / slide_7 等 */
export function extractPageNoFromImageName(fileName: string): number | null {
  const base = String(fileName || '')
    .replace(/^.*[/\\]/, '')
    .replace(/\.[^.]+$/, '')
    .trim()
  if (!base) return null
  const patterns = [
    /(?:^|[_\-\s.])page[_-\s.]?0*(\d+)(?:$|[_\-\s.])/i,
    /(?:^|[_\-\s.])p[_-\s.]?0*(\d+)(?:$|[_\-\s.])/i,
    /第\s*0*(\d+)\s*页/,
    /^0*(\d+)$/,
    /(\d+)/,
  ]
  for (const re of patterns) {
    const m = base.match(re)
    if (!m?.[1]) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0 && n < 10_000) return Math.floor(n)
  }
  return null
}

export type CourseRecordPageImage = {
  pageNo: number
  file: File
  previewUrl: string
  fileName: string
}

/**
 * 将上传图片按编号匹配到口播页；无法解析编号的按文件名排序后依次填空缺页。
 */
export function matchImagesToCoursePages(
  files: File[],
  pages: CourseRecordPage[],
): { matched: CourseRecordPageImage[]; unmatchedNames: string[]; missingPageNos: number[] } {
  const pageNos = new Set(pages.map((p) => p.pageNo))
  const byNo = new Map<number, CourseRecordPageImage>()
  const leftover: File[] = []

  for (const file of files) {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
      continue
    }
    const pageNo = extractPageNoFromImageName(file.name)
    if (pageNo != null && pageNos.has(pageNo) && !byNo.has(pageNo)) {
      byNo.set(pageNo, {
        pageNo,
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
      })
    } else {
      leftover.push(file)
    }
  }

  leftover.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
  const missing = pages.map((p) => p.pageNo).filter((n) => !byNo.has(n))
  for (let i = 0; i < leftover.length && i < missing.length; i++) {
    const pageNo = missing[i]!
    const file = leftover[i]!
    byNo.set(pageNo, {
      pageNo,
      file,
      previewUrl: URL.createObjectURL(file),
      fileName: file.name,
    })
  }

  const matched = pages
    .map((p) => byNo.get(p.pageNo))
    .filter((x): x is CourseRecordPageImage => !!x)
  const unmatchedNames = leftover.slice(missing.length).map((f) => f.name)
  const missingPageNos = pages.map((p) => p.pageNo).filter((n) => !byNo.has(n))
  return { matched, unmatchedNames, missingPageNos }
}

export function revokeCourseRecordPageImages(images: Iterable<CourseRecordPageImage | undefined | null>) {
  for (const img of images) {
    if (img?.previewUrl) URL.revokeObjectURL(img.previewUrl)
  }
}

/** 探测音频真实时长（秒）；失败返回 null */
export function probeAudioDurationSec(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const el = new Audio()
    el.preload = 'metadata'
    const finish = (sec: number | null) => {
      URL.revokeObjectURL(url)
      resolve(sec)
    }
    el.onloadedmetadata = () => {
      const d = el.duration
      finish(Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : null)
    }
    el.onerror = () => finish(null)
    el.src = url
  })
}

function pickRecorderMime(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ]
  for (const t of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t
  }
  return 'video/webm'
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  canvasW: number,
  canvasH: number,
  naturalW: number,
  naturalH: number,
) {
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, canvasW, canvasH)
  const scale = Math.min(canvasW / Math.max(1, naturalW), canvasH / Math.max(1, naturalH))
  const w = naturalW * scale
  const h = naturalH * scale
  const x = (canvasW - w) / 2
  const y = (canvasH - h) / 2
  ctx.drawImage(img, x, y, w, h)
}

export type CourseRecordVideoSlide = {
  pageNo: number
  title: string
  imageBlob: Blob
  audioBlob: Blob
  /** 展示与成片均用此时长（优先真实音频时长） */
  durationSec: number
}

/**
 * 浏览器端：每页图片展示时长 = 对应页音频时长，合成可下载 WebM。
 * （Safari 部分版本对 MediaRecorder 支持有限，失败时抛错提示改用 Chrome。）
 */
export async function composeCourseRecordVideo(params: {
  slides: CourseRecordVideoSlide[]
  width?: number
  height?: number
  fps?: number
  gapSec?: number
  onProgress?: (message: string, ratio: number) => void
  signal?: AbortSignal
}): Promise<Blob> {
  const slides = params.slides.filter((s) => s.imageBlob && s.audioBlob && s.durationSec > 0)
  if (!slides.length) throw new Error('没有可合成的页（需同时有图片与音频）')
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持 MediaRecorder，请用 Chrome / Edge 生成视频')
  }

  const width = params.width ?? 1280
  const height = params.height ?? 720
  const fps = params.fps ?? 30
  const gapSec = Math.max(0, params.gapSec ?? 0.25)
  const signal = params.signal

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')

  const audioCtx = new AudioContext()
  const dest = audioCtx.createMediaStreamDestination()
  // 静音扬声器，避免合成时外放；录音仍从 dest 取音轨
  const silent = audioCtx.createGain()
  silent.gain.value = 0
  silent.connect(audioCtx.destination)

  const canvasStream = canvas.captureStream(fps)
  const combined = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ])
  const mimeType = pickRecorderMime()
  const chunks: BlobPart[] = []
  const recorder = new MediaRecorder(combined, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  })
  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data)
  }

  const stopPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('录制失败'))
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType.split(';')[0] || 'video/webm' }))
    }
  })

  if (audioCtx.state === 'suspended') await audioCtx.resume()
  recorder.start(250)

  let drawRaf = 0
  let currentImg: HTMLImageElement | null = null
  let currentNatural = { w: width, h: height }

  const paintLoop = () => {
    if (currentImg) {
      drawImageContain(ctx, currentImg, width, height, currentNatural.w, currentNatural.h)
    }
    drawRaf = requestAnimationFrame(paintLoop)
  }
  paintLoop()

  const loadImage = (blob: Blob) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('图片加载失败'))
      }
      img.src = url
    })

  const waitSec = (sec: number) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('已取消'))
        return
      }
      const t = window.setTimeout(() => resolve(), Math.max(0, sec * 1000))
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(t)
          reject(new Error('已取消'))
        },
        { once: true },
      )
    })

  try {
    const total = slides.length
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('已取消')
      const slide = slides[i]!
      params.onProgress?.(
        `合成第 ${slide.pageNo} 页（${i + 1}/${total}）· ${slide.title}`,
        i / total,
      )

      const img = await loadImage(slide.imageBlob)
      currentImg = img
      currentNatural = { w: img.naturalWidth || width, h: img.naturalHeight || height }
      drawImageContain(ctx, img, width, height, currentNatural.w, currentNatural.h)

      const audioBuf = await audioCtx.decodeAudioData(await slide.audioBlob.arrayBuffer())
      const src = audioCtx.createBufferSource()
      src.buffer = audioBuf
      src.connect(dest)
      src.connect(silent)

      const playSec = Math.max(slide.durationSec, audioBuf.duration || 0)
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => resolve(), Math.ceil(playSec * 1000) + 40)
        src.onended = () => {
          window.clearTimeout(timer)
          resolve()
        }
        try {
          src.start(0)
        } catch (e) {
          window.clearTimeout(timer)
          reject(e instanceof Error ? e : new Error('音频播放失败'))
        }
        signal?.addEventListener(
          'abort',
          () => {
            window.clearTimeout(timer)
            try {
              src.stop()
            } catch {
              /* ignore */
            }
            reject(new Error('已取消'))
          },
          { once: true },
        )
      })

      if (i < total - 1 && gapSec > 0) await waitSec(gapSec)
    }

    params.onProgress?.('收尾封装…', 0.98)
    await waitSec(0.35)
    recorder.stop()
    const blob = await stopPromise
    params.onProgress?.('完成', 1)
    return blob
  } catch (e) {
    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      /* ignore */
    }
    throw e
  } finally {
    cancelAnimationFrame(drawRaf)
    canvasStream.getTracks().forEach((t) => t.stop())
    dest.stream.getTracks().forEach((t) => t.stop())
    void audioCtx.close()
  }
}
