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

  // 兼容 #～####、有无空格、·/—/： 等标题分隔
  const headingRe = /^#{1,4}\s*第\s*(\d+)\s*页(?:\s*[·•.\-—|:：]\s*(.+))?$/gm
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
        const script = cleanOralPageScript(text.slice(bodyStart, bodyEnd))
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
    const rest = cleanOralPageScript(lines.slice(1).join('\n'))
    if (rest) {
      return { pageNo: i + 1, title: first.slice(0, 40), script: rest }
    }
    return { pageNo: i + 1, title: `第 ${i + 1} 页`, script: cleanOralPageScript(first) }
  })
}

/** 去掉幻灯备注行，保留可朗读正文 */
function cleanOralPageScript(raw: string): string {
  return String(raw || '')
    .replace(/^>\s*幻灯文件[：:].*$/gim, '')
    .replace(/^>\s*slide\s*file[：:].*$/gim, '')
    .replace(/^[\s>\-*]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 是否已是「第 N 页」Markdown 分页稿（可走本地规则，无需调模型） */
export function hasMarkdownPageHeadings(raw: string): boolean {
  const text = String(raw || '')
  const re = /^#{1,4}\s*第\s*\d+\s*页/gm
  let n = 0
  while (re.exec(text) != null) {
    n += 1
    if (n >= 2) return true
  }
  return n >= 1 && text.length < 800
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

const AI_PARSE_SYSTEM = `你是录播课口播稿分页助手。把口播/讲稿按幻灯页切开。
只输出 JSON（禁止 Markdown、禁止解释）：{"pages":[{"pageNo":1,"title":"短标题","script":"该页口播正文"},...]}
规则：保留原文口语；有「第N页」则按此切；无页码则按话题切，每页约 40～150 字；pageNo 从 1 递增。`

function splitTextForAiParse(text: string, maxChars = 4500): string[] {
  if (text.length <= maxChars) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars)
    let cut = window.lastIndexOf('\n\n')
    if (cut < maxChars * 0.4) cut = window.lastIndexOf('\n')
    if (cut < maxChars * 0.4) cut = maxChars
    parts.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) parts.push(rest)
  return parts.filter(Boolean)
}

async function aiParseOralChunk(
  chunk: string,
  provider: 'qwen' | 'doubao',
): Promise<CourseRecordPage[]> {
  const res = await postAiChat({
    provider,
    temperature: 0.1,
    stream: false,
    taskType: 'generate_copywriting',
    messages: [
      { role: 'system', content: AI_PARSE_SYSTEM },
      {
        role: 'user',
        content: `请解析下列口播稿并分页（只输出 JSON）：\n\n${chunk}`,
      },
    ],
  })
  const pages = pagesFromAiJson(res.content || '')
  if (!pages?.length) throw new Error('模型未返回有效分页 JSON')
  return pages
}

export type ParseOralScriptAiResult = {
  pages: CourseRecordPage[]
  /** markdown=本地识别 MD 分页；ai=模型分页 */
  source: 'markdown' | 'ai'
}

/** AI/智能解析分页；已是 MD「第 N 页」结构时直接本地解析，避免上游超时 */
export async function parseOralScriptWithAi(raw: string): Promise<ParseOralScriptAiResult> {
  const text = String(raw || '').trim()
  if (!text) throw new Error('口播稿为空')

  if (hasMarkdownPageHeadings(text)) {
    const local = parseOralScriptMarkdown(text)
    if (local.length >= 1) {
      return {
        pages: local.map((p, i) => ({ ...p, pageNo: i + 1 })),
        source: 'markdown',
      }
    }
  }

  const chunks = splitTextForAiParse(text, 4500)
  const providers: Array<'qwen' | 'doubao'> = ['qwen', 'doubao']
  let lastErr = 'AI 解析失败'
  for (const provider of providers) {
    try {
      const merged: CourseRecordPage[] = []
      for (let ci = 0; ci < chunks.length; ci++) {
        const part = await aiParseOralChunk(chunks[ci]!, provider)
        for (const p of part) {
          merged.push({
            ...p,
            pageNo: merged.length + 1,
            title: p.title || `第 ${merged.length + 1} 页`,
            script: cleanOralPageScript(p.script),
          })
        }
      }
      if (merged.length) return { pages: merged, source: 'ai' }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      // 超时/上游错误换下一家；其它错误也继续试
      continue
    }
  }
  throw new Error(lastErr)
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

export type CourseRecordVideoSlide = {
  pageNo: number
  title: string
  imageBlob: Blob
  audioBlob: Blob
  /** 展示与成片均用此时长（优先真实音频时长） */
  durationSec: number
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

async function blobToU8(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

/** 统一压成 JPEG，避免 webp/png 在 wasm ffmpeg 里兼容差异 */
async function rasterizeSlideJpeg(
  imageBlob: Blob,
  canvasW: number,
  canvasH: number,
): Promise<Uint8Array> {
  const bmp = await createImageBitmap(imageBlob)
  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  drawImageContain(ctx, bmp, canvasW, canvasH, bmp.width, bmp.height)
  bmp.close()
  const jpeg = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('JPEG 编码失败'))),
      'image/jpeg',
      0.9,
    )
  })
  return blobToU8(jpeg)
}

async function ffmpegDeleteQuiet(
  ffmpeg: { deleteFile: (n: string) => Promise<boolean | void> },
  name: string,
) {
  try {
    await ffmpeg.deleteFile(name)
  } catch {
    /* ignore */
  }
}

/**
 * 浏览器端 ffmpeg.wasm：每页静图时长对齐音频，离线合成 MP4（远快于实时 MediaRecorder）。
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

  const width = params.width ?? 1280
  const height = params.height ?? 720
  const fps = Math.max(1, Math.min(6, params.fps ?? 2))
  const gapSec = Math.max(0, params.gapSec ?? 0.12)
  const signal = params.signal
  const assertNotAborted = () => {
    if (signal?.aborted) throw new Error('已取消')
  }

  params.onProgress?.('加载视频引擎…', 0.02)
  const { loadFfmpeg } = await import('./concatVideoSegments')
  const ffmpeg = await loadFfmpeg()
  assertNotAborted()

  const cleanup: string[] = []
  const segNames: string[] = []

  try {
    const total = slides.length
    for (let i = 0; i < total; i++) {
      assertNotAborted()
      const slide = slides[i]!
      params.onProgress?.(
        `编码第 ${slide.pageNo} 页（${i + 1}/${total}）· ${slide.title}`,
        0.05 + (0.75 * i) / total,
      )

      const imgName = `cr_img_${i}.jpg`
      const audName = `cr_aud_${i}.mp3`
      const segName = `cr_seg_${i}.mp4`
      cleanup.push(imgName, audName, segName)

      const jpeg = await rasterizeSlideJpeg(slide.imageBlob, width, height)
      await ffmpeg.writeFile(imgName, jpeg)
      await ffmpeg.writeFile(audName, await blobToU8(slide.audioBlob))

      const dur = Math.max(0.4, slide.durationSec + (i < total - 1 ? gapSec : 0))
      const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}`

      let code = await ffmpeg.exec([
        '-y',
        '-loop',
        '1',
        '-framerate',
        String(fps),
        '-i',
        imgName,
        '-i',
        audName,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-tune',
        'stillimage',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-t',
        dur.toFixed(3),
        '-movflags',
        '+faststart',
        segName,
      ])

      if (code !== 0) {
        code = await ffmpeg.exec([
          '-y',
          '-loop',
          '1',
          '-i',
          imgName,
          '-i',
          audName,
          '-vf',
          vf,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          '-movflags',
          '+faststart',
          segName,
        ])
      }
      if (code !== 0) {
        throw new Error(`第 ${slide.pageNo} 页编码失败（ffmpeg exit ${code}）`)
      }
      segNames.push(segName)
      await ffmpegDeleteQuiet(ffmpeg, imgName)
      await ffmpegDeleteQuiet(ffmpeg, audName)
    }

    assertNotAborted()
    params.onProgress?.('合并成片 MP4…', 0.88)
    const listName = 'cr_list.txt'
    const outName = 'cr_out.mp4'
    cleanup.push(listName, outName)
    const listBody = segNames.map((n) => `file '${n}'`).join('\n')
    await ffmpeg.writeFile(listName, listBody)

    let mergeCode = await ffmpeg.exec([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listName,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outName,
    ])
    if (mergeCode !== 0) {
      mergeCode = await ffmpeg.exec([
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listName,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outName,
      ])
    }
    if (mergeCode !== 0) throw new Error(`合并成片失败（ffmpeg exit ${mergeCode}）`)

    const raw = await ffmpeg.readFile(outName)
    if (!(raw instanceof Uint8Array) || raw.length < 1024) {
      throw new Error('成片文件无效，请重试')
    }
    const copy = new Uint8Array(raw.length)
    copy.set(raw)
    params.onProgress?.('完成', 1)
    return new Blob([copy], { type: 'video/mp4' })
  } finally {
    for (const n of cleanup) {
      await ffmpegDeleteQuiet(ffmpeg, n)
    }
  }
}
