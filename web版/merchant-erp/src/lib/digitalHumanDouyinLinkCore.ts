/** 抖音链接解析 → 提取口播文案 + 动作指令（服务端 / dev 中间件共用） */

import { runMeooAiChatCore } from '../../vite-plugins/aiGateway/meooAiChatCore.js'

export type DouyinLinkParseInput = {
  url: string
  tenantId?: string
}

export type DouyinLinkParseResult =
  | {
      ok: true
      normalizedUrl: string
      videoId: string | null
      sourceTitle: string | null
      script: string
      motionInstructions: string
      /** page=发布文案；asr=视频音频识别；ai_extract=AI 还原 */
      scriptSource: 'page' | 'asr' | 'ai_extract'
    }
  | { ok: false; message: string }

const DOUYIN_HOST =
  /(?:^|\.)?(?:douyin\.com|iesdouyin\.com|v\.douyin\.com)(?:\/|$)/i

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const DOUYIN_FETCH_HEADERS = {
  'User-Agent': MOBILE_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://www.douyin.com/',
} as const

export function isDouyinShareUrl(raw: string): boolean {
  const t = raw.trim()
  if (!t) return false
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    return DOUYIN_HOST.test(u.hostname)
  } catch {
    return /douyin\.com|v\.douyin/i.test(t)
  }
}

export function normalizeDouyinShareUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    if (!DOUYIN_HOST.test(u.hostname)) return null
    u.hash = ''
    return u.toString()
  } catch {
    return isDouyinShareUrl(t) ? t : null
  }
}

export type DouyinShareExtract = {
  /** 从口令/文本中识别到的 https 链接（已规范化） */
  url: string | null
  /** 口令或链接里直接出现的视频 aweme_id */
  videoId: string | null
}

function cleanExtractedDouyinUrl(raw: string): string {
  let u = raw.trim()
  u = u.replace(/[/，。！？、；：'"）】\]>]+$/u, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, '')}`
  try {
    const parsed = new URL(u)
    if (!DOUYIN_HOST.test(parsed.hostname)) return u
    parsed.hash = ''
    u = parsed.toString()
  } catch {
    /* keep cleaned string */
  }
  if (/v\.douyin\.com/i.test(u) && !u.endsWith('/')) u += '/'
  return u
}

function scoreDouyinUrlCandidate(url: string): number {
  if (extractDouyinVideoId(url)) return 100
  if (/\/share\/video\//i.test(url)) return 90
  if (/v\.douyin\.com/i.test(url)) return 50
  if (isDouyinUserProfileUrl(url)) return 10
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return 40
  return 0
}

/** 从整段分享口令中提取视频 ID（若文案里直接带有 /video/ 或 modal_id 等） */
export function extractDouyinVideoIdFromShareText(raw: string): string | null {
  const patterns = [
    /\/video\/(\d{15,22})/,
    /\/share\/video\/(\d{15,22})/,
    /[?&](?:modal_id|item_id|aweme_id)=(\d{15,22})/,
    /(?:modal_id|item_id|aweme_id)\s*[=:]\s*(\d{15,22})/,
  ]
  for (const re of patterns) {
    const m = re.exec(raw)
    if (m?.[1]) return m[1]
  }
  return null
}

/** 从抖音分享口令/整段文案中提取链接与视频 ID（用户通常粘贴整段而非纯 URL） */
export function extractDouyinShareFromText(raw: string): DouyinShareExtract {
  const t = raw.trim()
  if (!t) return { url: null, videoId: null }

  const videoId = extractDouyinVideoIdFromShareText(t)
  const candidates: string[] = []

  const httpsRe =
    /https?:\/\/(?:v\.douyin\.com\/[A-Za-z0-9_-]+\/?|(?:www\.)?(?:douyin|iesdouyin)\.com\/[^\s\u4e00-\u9fff「」【】《》]+)/gi
  for (const m of t.matchAll(httpsRe)) {
    if (m[0]) candidates.push(cleanExtractedDouyinUrl(m[0]))
  }

  const bareRe =
    /(?:^|[\s「」【】《】])((?:v\.douyin\.com\/[A-Za-z0-9_-]+\/?)|(?:(?:www\.)?(?:douyin|iesdouyin)\.com\/[^\s\u4e00-\u9fff「」【】《》]+))/gi
  for (const m of t.matchAll(bareRe)) {
    if (m[1]) candidates.push(cleanExtractedDouyinUrl(m[1]))
  }

  const normalizedDirect = normalizeDouyinShareUrl(t)
  if (normalizedDirect) candidates.push(normalizedDirect)

  const unique = [...new Set(candidates.filter(Boolean))]
  if (unique.length === 0) {
    return { url: videoId ? `https://www.douyin.com/video/${videoId}` : null, videoId }
  }

  unique.sort((a, b) => scoreDouyinUrlCandidate(b) - scoreDouyinUrlCandidate(a))
  return { url: unique[0] ?? null, videoId }
}

/** @deprecated 请优先使用 extractDouyinShareFromText */
export function extractDouyinUrlFromText(raw: string): string | null {
  return extractDouyinShareFromText(raw).url
}

export function extractDouyinVideoId(url: string): string | null {
  const m =
    /\/video\/(\d+)/.exec(url) ??
    /[?&]modal_id=(\d+)/.exec(url) ??
    /[?&]item_id=(\d+)/.exec(url) ??
    /\/share\/video\/(\d+)/.exec(url)
  return m?.[1] ?? null
}

type DouyinAwemeItem = {
  desc?: string
  video_text?: string | null
  chapter_list?: Array<{ title?: string; desc?: string; content?: string }> | null
  video?: {
    duration?: number
    play_addr?: { url_list?: string[] }
    bit_rate?: Array<{ play_addr?: { url_list?: string[] } }>
    download_addr?: { url_list?: string[] }
  }
}

function parseJsonObjectFromScriptPrefix(raw: string): unknown | null {
  let depth = 0
  let end = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end <= 0) return null
  try {
    return JSON.parse(raw.slice(0, end)) as unknown
  } catch {
    return null
  }
}

function findAwemeItemInUnknown(node: unknown): DouyinAwemeItem | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const el of node) {
      const hit = findAwemeItemInUnknown(el)
      if (hit) return hit
    }
    return null
  }
  const o = node as Record<string, unknown>
  if (Array.isArray(o.item_list)) {
    const first = o.item_list[0]
    if (first && typeof first === 'object' && (first as DouyinAwemeItem).video) {
      return first as DouyinAwemeItem
    }
  }
  const videoInfoRes = o.videoInfoRes
  if (videoInfoRes && typeof videoInfoRes === 'object') {
    const list = (videoInfoRes as { item_list?: DouyinAwemeItem[] }).item_list
    if (list?.[0]?.video) return list[0]
  }
  for (const v of Object.values(o)) {
    const hit = findAwemeItemInUnknown(v)
    if (hit) return hit
  }
  return null
}

function parseRouterDataAwemeItem(html: string): DouyinAwemeItem | null {
  const m = /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*)/.exec(html)
  if (!m?.[1]) return null
  const root = parseJsonObjectFromScriptPrefix(m[1])
  if (!root || typeof root !== 'object') return null
  const loader = (root as { loaderData?: Record<string, unknown> }).loaderData
  if (loader && typeof loader === 'object') {
    const fromLoader = findAwemeItemInUnknown(loader)
    if (fromLoader) return fromLoader
  }
  return findAwemeItemInUnknown(root)
}

function extractDouyinVideoIdFromHtml(html: string): string | null {
  const ogUrl = pickMetaContent(html, 'og:url')
  if (ogUrl) {
    const fromOg = extractDouyinVideoId(ogUrl)
    if (fromOg) return fromOg
  }
  const patterns = [
    /"aweme_id"\s*:\s*"(\d{10,})"/,
    /"itemId"\s*:\s*"(\d{10,})"/,
    /"item_id"\s*:\s*"(\d{10,})"/,
    /\/video\/(\d{10,})/,
    /modal_id=(\d{10,})/,
    /item_id=(\d{10,})/,
  ]
  for (const re of patterns) {
    const hit = re.exec(html)
    if (hit?.[1]) return hit[1]
  }
  return null
}

function extractPlayUrlFromHtml(html: string): string | null {
  const blob = html
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
  const patterns = [
    /"play_addr"\s*:\s*\{[\s\S]{0,400}?"url_list"\s*:\s*\[\s*"((?:\\.|[^"\\])*)"/,
    /"download_addr"\s*:\s*\{[\s\S]{0,400}?"url_list"\s*:\s*\[\s*"((?:\\.|[^"\\])*)"/,
    /"playApi"\s*:\s*"((?:\\.|[^"\\])*)"/,
  ]
  for (const re of patterns) {
    const hit = re.exec(blob)
    if (!hit?.[1]) continue
    const raw = unescapeJsonString(hit[1]).trim()
    if (!/^https?:\/\//i.test(raw)) continue
    return raw.replace(/\/playwm\//, '/play/')
  }
  return null
}

function stripDouyinMetaBoilerplate(raw: string): string {
  let t = normalizeCaptionText(raw)
  const dash = t.indexOf(' - ')
  if (dash > 0) {
    const tail = t.slice(dash + 3)
    if (/发布在抖音|来抖音，记录美好生活|已经收获了/.test(tail)) {
      t = t.slice(0, dash).trim()
    }
  }
  return t.replace(/#\S+/g, '').replace(/\s{2,}/g, ' ').trim()
}

function pickDouyinPlayUrl(item: DouyinAwemeItem | null): string | null {
  if (!item?.video) return null
  const candidates: string[] = []
  const push = (list?: string[]) => {
    for (const u of list ?? []) {
      if (!/^https?:\/\//i.test(u)) continue
      const normalized = u.replace(/\/playwm\//, '/play/')
      if (!candidates.includes(normalized)) candidates.push(normalized)
    }
  }
  push(item.video.play_addr?.url_list)
  push(item.video.download_addr?.url_list)
  for (const br of item.video.bit_rate ?? []) {
    push(br.play_addr?.url_list)
  }
  return candidates[0] ?? null
}

const MAX_DOUYIN_VIDEO_MS = 900_000
const MAX_DOUYIN_DOWNLOAD_BYTES = 120 * 1024 * 1024

function readDashScopeAsrKey(env: Record<string, string>): string {
  return (env.MERCHANT_AI_QWEN_KEY ?? env.DASHSCOPE_API_KEY ?? '').trim()
}

export type AsrTimedSegment = {
  text: string
  beginMs: number
  endMs?: number
}

export type RemoteVideoAsrDetailed = {
  text: string
  segments: AsrTimedSegment[]
}

function readAsrTimeMs(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = row[k]
    let n: number | undefined
    if (typeof v === 'number' && Number.isFinite(v)) n = v
    else if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) n = Number(v)
    if (n == null) continue
    // 通义 ASR：小数=秒；>=1000=毫秒；0-59 整数=秒；60-999 整数=毫秒（避免 320ms 被当成 320 秒）
    if (!Number.isInteger(n)) return Math.round(n * 1000)
    if (n >= 1000) return Math.round(n)
    if (n >= 0 && n < 60) return Math.round(n * 1000)
    return Math.round(n)
  }
  return undefined
}

function pushAsrSegment(
  out: AsrTimedSegment[],
  text: string,
  beginMs?: number,
  endMs?: number,
): void {
  const t = String(text || '').trim()
  if (!t) return
  out.push({
    text: t,
    beginMs: beginMs ?? 0,
    endMs: endMs,
  })
}

function extractAsrSegmentsFromPayload(payload: unknown): AsrTimedSegment[] {
  if (!payload || typeof payload !== 'object') return []
  const o = payload as Record<string, unknown>
  const out: AsrTimedSegment[] = []

  const transcripts = o.transcripts
  if (Array.isArray(transcripts)) {
    for (const t of transcripts) {
      if (!t || typeof t !== 'object') continue
      const row = t as Record<string, unknown>
      const sentences = row.sentences
      if (Array.isArray(sentences)) {
        for (const s of sentences) {
          if (!s || typeof s !== 'object') continue
          const sent = s as Record<string, unknown>
          pushAsrSegment(
            out,
            String(sent.text ?? ''),
            readAsrTimeMs(sent, ['begin_time', 'beginTime', 'start_time', 'startTime']),
            readAsrTimeMs(sent, ['end_time', 'endTime', 'finish_time', 'finishTime']),
          )
        }
      }
      const words = row.words
      if (Array.isArray(words) && !out.length) {
        for (const w of words) {
          if (!w || typeof w !== 'object') continue
          const word = w as Record<string, unknown>
          pushAsrSegment(
            out,
            String(word.text ?? word.word ?? ''),
            readAsrTimeMs(word, ['begin_time', 'beginTime', 'start_time', 'startTime']),
            readAsrTimeMs(word, ['end_time', 'endTime', 'finish_time', 'finishTime']),
          )
        }
      }
    }
  }

  const results = o.results
  if (Array.isArray(results) && !out.length) {
    for (const r of results) {
      out.push(...extractAsrSegmentsFromPayload(r))
    }
  }

  const output = o.output
  if (output && typeof output === 'object' && !out.length) {
    out.push(...extractAsrSegmentsFromPayload(output))
  }

  return out.filter((s) => s.text.length > 0)
}

function mergeAsrDetailed(payload: unknown): RemoteVideoAsrDetailed | null {
  const segments = extractAsrSegmentsFromPayload(payload)
  if (segments.length) {
    const joined = segments.map((s) => s.text).join('').trim()
    if (joined.length >= 8) return { text: joined, segments }
  }
  if (!payload || typeof payload !== 'object') return null
  const o = payload as Record<string, unknown>
  const direct = o.text ?? o.transcript
  if (typeof direct === 'string' && direct.trim().length >= 8) {
    return { text: direct.trim(), segments }
  }
  return null
}

function extractAsrTextFromPayload(payload: unknown): string {
  const segments = extractAsrSegmentsFromPayload(payload)
  if (segments.length) return segments.map((s) => s.text).join('').trim()
  if (!payload || typeof payload !== 'object') return ''
  const o = payload as Record<string, unknown>
  const direct = o.text ?? o.transcript
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const transcripts = o.transcripts
  if (Array.isArray(transcripts)) {
    const parts = transcripts
      .map((t) => {
        if (!t || typeof t !== 'object') return ''
        const row = t as Record<string, unknown>
        if (typeof row.text === 'string') return row.text
        const sentences = row.sentences
        if (Array.isArray(sentences)) {
          return sentences
            .map((s) => (s && typeof s === 'object' ? String((s as { text?: string }).text ?? '') : ''))
            .filter(Boolean)
            .join('')
        }
        return ''
      })
      .filter(Boolean)
    if (parts.length) return parts.join('\n').trim()
  }

  const results = o.results
  if (Array.isArray(results)) {
    for (const r of results) {
      const t = extractAsrTextFromPayload(r)
      if (t) return t
    }
  }

  const output = o.output
  if (output && typeof output === 'object') {
    const t = extractAsrTextFromPayload(output)
    if (t) return t
  }

  return ''
}

/** 整段 ASR 阶段总预算（须 < Nginx erp-api 180s，并留时间给抖音抓取与动作推断） */
const ASR_PHASE_DEADLINE_MS = 78_000
const ASR_PRIMARY_MODEL = 'qwen3-asr-flash-filetrans'
const ASR_FALLBACK_MODELS = ['paraformer-v2'] as const

function asrRemainingMs(deadline: number): number {
  return Math.max(0, deadline - Date.now())
}

function asrPhaseDeadline(videoDurationMs?: number | null): number {
  const onVercel = Boolean(process.env.VERCEL)
  const cap = onVercel ? 42_000 : ASR_PHASE_DEADLINE_MS
  const scaled = Math.round((videoDurationMs ?? 45_000) * 0.18) + 28_000
  return Date.now() + Math.min(cap, Math.max(onVercel ? 32_000 : 50_000, scaled))
}

async function pollDashScopeAsrTask(
  taskId: string,
  apiKey: string,
  baseUrl: string,
  deadline: number,
): Promise<RemoteVideoAsrDetailed | null> {
  let waited = 0
  while (asrRemainingMs(deadline) > 1_500) {
    const delay = Math.min(waited < 8_000 ? 700 : 1_200, asrRemainingMs(deadline) - 500)
    if (delay <= 0) break
    await new Promise((r) => setTimeout(r, delay))
    waited += delay
    try {
      const res = await fetch(`${baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-DashScope-Async': 'enable',
        },
        signal: AbortSignal.timeout(Math.min(12_000, asrRemainingMs(deadline))),
      })
      if (!res.ok) continue
      const j = (await res.json()) as Record<string, unknown>
      const output = j.output as Record<string, unknown> | undefined
      const status = String(output?.task_status ?? j.task_status ?? '').toUpperCase()
      if (status === 'FAILED') return null
      if (status !== 'SUCCEEDED' && status !== 'SUCCESS') continue

      const result = output?.result as Record<string, unknown> | undefined
      const transcriptionUrl =
        (typeof result?.transcription_url === 'string' && result.transcription_url) ||
        (typeof output?.transcription_url === 'string' && output.transcription_url) ||
        null
      if (transcriptionUrl) {
        const tr = await fetch(transcriptionUrl, {
          signal: AbortSignal.timeout(Math.min(12_000, asrRemainingMs(deadline))),
        })
        if (tr.ok) {
          const payload = (await tr.json()) as unknown
          const detailed = mergeAsrDetailed(payload)
          if (detailed) return detailed
        }
      }

      const inline = mergeAsrDetailed(j)
      if (inline) return inline
    } catch {
      /* retry until deadline */
    }
  }
  return null
}

async function submitDashScopeAsrTask(
  fileUrl: string,
  apiKey: string,
  model: string,
  deadline: number,
): Promise<RemoteVideoAsrDetailed | null> {
  if (asrRemainingMs(deadline) < 6_000) return null
  const baseUrl = 'https://dashscope.aliyuncs.com'
  const input =
    model === ASR_PRIMARY_MODEL ? { file_url: fileUrl } : { file_urls: [fileUrl] }
  try {
    const res = await fetch(`${baseUrl}/api/v1/services/audio/asr/transcription`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model,
        input,
        parameters: { channel_id: [0], enable_itn: true, enable_words: true, enable_timestamp: true },
      }),
      signal: AbortSignal.timeout(Math.min(18_000, asrRemainingMs(deadline))),
    })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    const output = j.output as Record<string, unknown> | undefined
    const taskId = String(output?.task_id ?? j.task_id ?? '').trim()
    if (!taskId) return null
    return pollDashScopeAsrTask(taskId, apiKey, baseUrl, deadline)
  } catch {
    return null
  }
}

async function transcribeDouyinVideoViaDashScopeDetailed(
  fileUrl: string,
  env: Record<string, string>,
  deadline: number,
  models: readonly string[],
): Promise<RemoteVideoAsrDetailed | null> {
  const apiKey = readDashScopeAsrKey(env)
  if (!apiKey || asrRemainingMs(deadline) < 5_000) return null

  for (const model of models) {
    const detailed = await submitDashScopeAsrTask(fileUrl, apiKey, model, deadline)
    if (detailed && detailed.text.length >= 8) return detailed
    if (asrRemainingMs(deadline) < 8_000) break
  }
  return null
}

async function transcribeDouyinVideoViaDashScope(
  fileUrl: string,
  env: Record<string, string>,
  deadline: number,
  models: readonly string[],
): Promise<string | null> {
  const detailed = await transcribeDouyinVideoViaDashScopeDetailed(fileUrl, env, deadline, models)
  return detailed?.text && detailed.text.length >= 8 ? detailed.text : null
}

async function transcribeDouyinVideoAudioDetailed(
  playUrl: string,
  env: Record<string, string>,
  videoDurationMs?: number | null,
): Promise<RemoteVideoAsrDetailed | null> {
  const deadline = asrPhaseDeadline(videoDurationMs)
  const direct = playUrl.replace(/\/playwm\//, '/play/')

  let detailed = await transcribeDouyinVideoViaDashScopeDetailed(direct, env, deadline, [ASR_PRIMARY_MODEL])
  if (detailed && detailed.text.length >= 12) return detailed

  let ossMediaUrl: string | null = null
  if (asrRemainingMs(deadline) > 12_000) {
    const mediaUrl = await resolveMediaUrlForAsr(playUrl, env, deadline)
    if (mediaUrl !== direct) ossMediaUrl = mediaUrl
    if (ossMediaUrl && asrRemainingMs(deadline) > 8_000) {
      detailed = await transcribeDouyinVideoViaDashScopeDetailed(ossMediaUrl, env, deadline, [
        ASR_PRIMARY_MODEL,
      ])
      if (detailed && detailed.text.length >= 12) return detailed
    }
  }

  if (asrRemainingMs(deadline) > 15_000 && (!detailed || detailed.text.length < 12)) {
    detailed = await transcribeDouyinVideoViaDashScopeDetailed(
      ossMediaUrl ?? direct,
      env,
      deadline,
      ASR_FALLBACK_MODELS,
    )
  }

  return detailed && detailed.text.length >= 8 ? detailed : null
}

async function transcribeDouyinVideoAudio(
  playUrl: string,
  env: Record<string, string>,
  videoDurationMs?: number | null,
): Promise<string | null> {
  const deadline = asrPhaseDeadline(videoDurationMs)
  const direct = playUrl.replace(/\/playwm\//, '/play/')

  // 与 Vercel 一致：先直链 ASR（通义侧拉抖音 CDN）
  let text = await transcribeDouyinVideoViaDashScope(direct, env, deadline, [ASR_PRIMARY_MODEL])
  if (text && text.length >= 12) return text

  // 直链失败：ECS 下载转 OSS 再 ASR（共享剩余预算，不再串行 3 模型 × 120s）
  let ossMediaUrl: string | null = null
  if (asrRemainingMs(deadline) > 12_000) {
    const mediaUrl = await resolveMediaUrlForAsr(playUrl, env, deadline)
    if (mediaUrl !== direct) ossMediaUrl = mediaUrl
    if (ossMediaUrl && asrRemainingMs(deadline) > 8_000) {
      text = await transcribeDouyinVideoViaDashScope(ossMediaUrl, env, deadline, [ASR_PRIMARY_MODEL])
      if (text && text.length >= 12) return text
    }
  }

  // 仅当仍有预算且主模型未出结果时，快速试备用模型一次
  if (asrRemainingMs(deadline) > 15_000 && (!text || text.length < 12)) {
    text = await transcribeDouyinVideoViaDashScope(
      ossMediaUrl ?? direct,
      env,
      deadline,
      ASR_FALLBACK_MODELS,
    )
  }

  return text && text.length >= 8 ? text : null
}

async function downloadDouyinMediaBuffer(
  playUrl: string,
  timeoutMs = 28_000,
): Promise<Buffer | null> {
  const url = playUrl.replace(/\/playwm\//, '/play/')
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': MOBILE_UA,
        Referer: 'https://www.douyin.com/',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2048 || buf.length > MAX_DOUYIN_DOWNLOAD_BYTES) return null
    return buf
  } catch {
    return null
  }
}

async function uploadDouyinMediaForAsr(
  buffer: Buffer,
  env: Record<string, string>,
): Promise<string | null> {
  try {
    const { loadIceGatewayConfig } = await import('../../vite-plugins/aliyunIceGateway.js')
    const { putIceSourceObject } = await import('../../vite-plugins/aliyunOssIceUpload.js')
    const cfg = await loadIceGatewayConfig(process.cwd(), env)
    if (!cfg) return null
    const out = await putIceSourceObject(cfg, env, {
      fileName: `douyin-asr-${Date.now()}.mp4`,
      contentType: 'video/mp4',
      buffer,
    })
    return out.ok ? out.mediaUrl : null
  } catch {
    return null
  }
}

/** 抖音 CDN 常拦截通义直拉：服务端下载后转 OSS（受 ASR 总预算约束） */
async function resolveMediaUrlForAsr(
  playUrl: string,
  env: Record<string, string>,
  deadline: number,
): Promise<string> {
  const direct = playUrl.replace(/\/playwm\//, '/play/')
  const dlMs = Math.min(28_000, asrRemainingMs(deadline) - 4_000)
  if (dlMs < 5_000) return direct
  const buf = await downloadDouyinMediaBuffer(direct, dlMs)
  if (buf && asrRemainingMs(deadline) > 4_000) {
    const ossUrl = await uploadDouyinMediaForAsr(buf, env)
    if (ossUrl) return ossUrl
  }
  return direct
}

type DouyinLinkKind = 'video' | 'user_profile' | 'homepage' | 'unknown'

type DouyinLinkTarget = {
  url: string
  videoId: string | null
  shortLinkUnresolved: boolean
  linkKind: DouyinLinkKind
}

function isDouyinHomepageUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return /(?:^|\.)douyin\.com$/i.test(u.hostname) && (u.pathname === '/' || u.pathname === '')
  } catch {
    return false
  }
}

function isDouyinUserProfileUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (!/(?:^|\.)?(?:douyin\.com|iesdouyin\.com)$/i.test(u.hostname)) return false
    return /\/share\/user\//i.test(u.pathname) || /\/user\//i.test(u.pathname)
  } catch {
    return /share\/user|iesdouyin\.com\/share\/user/i.test(url)
  }
}

function classifyDouyinLinkKind(url: string, videoId: string | null): DouyinLinkKind {
  if (videoId) return 'video'
  if (isDouyinUserProfileUrl(url)) return 'user_profile'
  if (isDouyinHomepageUrl(url)) return 'homepage'
  return 'unknown'
}

function douyinLinkKindErrorMessage(
  kind: DouyinLinkKind,
  shortLinkUnresolved: boolean,
  extractedUrl: string,
): string | null {
  const prefix = extractedUrl ? `已从分享口令识别链接：${extractedUrl}。` : ''
  if (kind === 'user_profile') {
    return `${prefix}该链接跳转到达人主页（非视频页），无法提取口播。请在抖音打开目标视频后再点「分享」复制口令；或改用手动输入/文本驱动。`
  }
  if (kind === 'homepage' || shortLinkUnresolved) {
    return `${prefix}短链未能解析到具体视频（已跳转到抖音首页或无效页）。请换一条视频分享口令重试，或改用手动输入/文本驱动。`
  }
  return null
}

async function resolveDouyinLinkTarget(inputUrl: string): Promise<DouyinLinkTarget> {
  let url = inputUrl
  let videoId = extractDouyinVideoId(url)
  let shortLinkUnresolved = false

  if (/v\.douyin\.com/i.test(url)) {
    let current = url
    for (let step = 0; step < 8; step++) {
      try {
        const res = await fetch(current, {
          redirect: 'manual',
          headers: DOUYIN_FETCH_HEADERS,
          signal: AbortSignal.timeout(12_000),
        })
        const loc = res.headers.get('location')
        if (loc && res.status >= 300 && res.status < 400) {
          current = new URL(loc, current).toString()
          videoId = extractDouyinVideoId(current) ?? videoId
          if (videoId) {
            url = current
            break
          }
          if (isDouyinUserProfileUrl(current)) {
            url = current
            break
          }
          continue
        }
        if (res.status === 200) {
          const html = await res.text()
          videoId = extractDouyinVideoIdFromHtml(html) ?? extractDouyinVideoId(current) ?? videoId
          url = videoId ? current : url
          break
        }
        break
      } catch {
        break
      }
    }

    if (!videoId) {
      try {
        const res = await fetch(inputUrl, {
          redirect: 'follow',
          headers: DOUYIN_FETCH_HEADERS,
          signal: AbortSignal.timeout(15_000),
        })
        const finalUrl = res.url?.trim() || inputUrl
        url = finalUrl
        videoId = extractDouyinVideoId(finalUrl) ?? videoId
        if (!videoId && res.ok) {
          const html = await res.text()
          videoId = extractDouyinVideoIdFromHtml(html) ?? videoId
        }
        if (!videoId && isDouyinHomepageUrl(finalUrl)) {
          shortLinkUnresolved = true
        }
      } catch {
        shortLinkUnresolved = true
      }
    }
  } else {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: DOUYIN_FETCH_HEADERS,
        signal: AbortSignal.timeout(15_000),
      })
      url = res.url?.trim() || url
      videoId = extractDouyinVideoId(url) ?? videoId
      if (!videoId && res.ok) {
        const html = await res.text()
        videoId = extractDouyinVideoIdFromHtml(html) ?? videoId
      }
    } catch {
      /* keep original */
    }
  }

  const linkKind = classifyDouyinLinkKind(url, videoId)
  return { url, videoId, shortLinkUnresolved, linkKind }
}

export type DouyinVideoPublishResolve =
  | { ok: true; normalizedUrl: string; note: string }
  | { ok: false; error: string }

/** 云剪回链：从分享口令提取链接、解析短链并归一化为视频作品页 */
export async function resolveDouyinVideoPublishUrl(raw: string): Promise<DouyinVideoPublishResolve> {
  const t = raw.trim()
  if (!t) return { ok: false, error: '请粘贴抖音分享口令或作品链接' }

  const share = extractDouyinShareFromText(t)
  let inputUrl = share.url
  if (!inputUrl && share.videoId) {
    inputUrl = `https://www.douyin.com/video/${share.videoId}`
  }
  if (!inputUrl) {
    return {
      ok: false,
      error: '未从分享口令中识别到抖音链接，请粘贴抖音「分享」复制的整段文案（含 https://v.douyin.com/…）',
    }
  }

  const target = await resolveDouyinLinkTarget(inputUrl)
  const videoId = target.videoId ?? share.videoId

  if (target.linkKind === 'user_profile') {
    return { ok: false, error: '该链接是达人主页，请打开具体视频作品后再分享提交' }
  }
  if ((target.linkKind === 'homepage' || target.shortLinkUnresolved) && !videoId) {
    return { ok: false, error: '短链未能解析到具体视频，请换一条视频分享口令重试' }
  }

  const normalizedUrl = videoId ? `https://www.douyin.com/video/${videoId}` : target.url
  if (!normalizedUrl || normalizedUrl.length < 12) {
    return { ok: false, error: '请提交抖音视频作品链接（douyin.com）' }
  }

  let note = '链接格式符合抖音作品页'
  if (t !== inputUrl && t !== normalizedUrl) note = '已从分享口令识别并解析视频链接'
  else if (/v\.douyin\.com/i.test(inputUrl) && videoId) note = '短链已解析为视频作品页'

  return { ok: true, normalizedUrl, note }
}

async function fetchIesdouyinItemById(awemeId: string): Promise<DouyinAwemeItem | null> {
  const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?reflow_source=reflow_page&item_ids=${encodeURIComponent(awemeId)}`
  try {
    const res = await fetch(apiUrl, {
      headers: {
        ...DOUYIN_FETCH_HEADERS,
        Accept: 'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    const j = (await res.json()) as { status_code?: number; item_list?: DouyinAwemeItem[] }
    if (j.status_code !== 0 || !j.item_list?.[0]) return null
    return j.item_list[0]
  } catch {
    return null
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

function normalizeCaptionText(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickMetaContent(html: string, prop: string): string | null {
  const re = new RegExp(`property="${prop}" content="([^"]+)"`, 'i')
  const hit = re.exec(html)
  return hit?.[1]?.trim() ?? null
}

function extractEmbeddedDouyinCaption(html: string): string | null {
  const renderMatch = /id="RENDER_DATA"[^>]*>([^<]+)/i.exec(html)
  const blobs = [html, renderMatch?.[1] ? decodeURIComponent(renderMatch[1]) : ''].filter(Boolean)

  for (const blob of blobs) {
    const nested = /"desc"\s*:\s*\{[^}]*"text"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(blob)
    if (nested?.[1]) {
      const t = normalizeCaptionText(unescapeJsonString(nested[1]))
      if (t.length >= 12) return t
    }
    for (const field of ['desc', 'caption', 'content', 'text']) {
      const re = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's')
      const m = re.exec(blob)
      if (!m?.[1]) continue
      const t = normalizeCaptionText(unescapeJsonString(m[1]))
      if (t.length >= 12 && !/^https?:\/\//i.test(t)) return t
    }
  }
  return null
}

type DouyinPageExtract = {
  title: string | null
  description: string | null
  caption: string | null
  awemeItem: DouyinAwemeItem | null
  playUrl: string | null
  videoDurationMs: number | null
}

async function tryExtractDouyinPageContent(url: string): Promise<DouyinPageExtract> {
  const empty: DouyinPageExtract = {
    title: null,
    description: null,
    caption: null,
    awemeItem: null,
    playUrl: null,
    videoDurationMs: null,
  }
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: DOUYIN_FETCH_HEADERS,
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return empty
    const html = await res.text()
    const awemeItem = parseRouterDataAwemeItem(html)
    const title = pickMetaContent(html, 'og:title') ?? pickMetaContent(html, 'twitter:title')
    const description =
      pickMetaContent(html, 'og:description') ??
      pickMetaContent(html, 'description') ??
      pickMetaContent(html, 'twitter:description')
    const caption =
      extractEmbeddedDouyinCaption(html) ??
      (awemeItem?.desc ? stripDouyinMetaBoilerplate(awemeItem.desc) : null)
    const playUrl = pickDouyinPlayUrl(awemeItem) ?? extractPlayUrlFromHtml(html)
    const videoDurationMs = awemeItem?.video?.duration ?? null
    return { title, description, caption, awemeItem, playUrl, videoDurationMs }
  } catch {
    return empty
  }
}

function mergeDouyinPageExtract(a: DouyinPageExtract, b: DouyinPageExtract): DouyinPageExtract {
  return {
    title: a.title ?? b.title,
    description: a.description ?? b.description,
    caption: a.caption ?? b.caption,
    awemeItem: a.awemeItem ?? b.awemeItem,
    playUrl: a.playUrl ?? b.playUrl,
    videoDurationMs: a.videoDurationMs ?? b.videoDurationMs,
  }
}

function collectDouyinFetchUrls(normalizedUrl: string, videoId: string | null): string[] {
  const out: string[] = []
  const push = (u: string | null | undefined) => {
    if (!u || out.includes(u)) return
    out.push(u)
  }
  if (videoId) {
    push(`https://www.iesdouyin.com/share/video/${videoId}/`)
    push(`https://www.douyin.com/video/${videoId}`)
  }
  push(normalizedUrl)
  return out
}

async function loadDouyinMediaContext(
  normalizedUrl: string,
  videoId: string | null,
): Promise<DouyinPageExtract> {
  const empty: DouyinPageExtract = {
    title: null,
    description: null,
    caption: null,
    awemeItem: null,
    playUrl: null,
    videoDurationMs: null,
  }
  let page = empty
  for (const fetchUrl of collectDouyinFetchUrls(normalizedUrl, videoId)) {
    page = mergeDouyinPageExtract(page, await tryExtractDouyinPageContent(fetchUrl))
    if (page.playUrl && page.awemeItem) break
  }
  if (!page.playUrl && videoId) {
    const item = await fetchIesdouyinItemById(videoId)
    if (item) {
      page = mergeDouyinPageExtract(page, {
        title: null,
        description: null,
        caption: item.desc ? stripDouyinMetaBoilerplate(item.desc) : null,
        awemeItem: item,
        playUrl: pickDouyinPlayUrl(item),
        videoDurationMs: item.video?.duration ?? null,
      })
    }
  }
  return page
}

function extractDouyinShareCaptionText(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const bracket = /【([^】]{2,80})】([^]*)/.exec(t)
  if (bracket) {
    const title = bracket[1].trim()
    const rest = bracket[2]
      .replace(/https?:\/\/\S+/g, '')
      .replace(/复制打开抖音[，,]?/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const combined = `${title}${rest ? ` ${rest}` : ''}`.trim()
    if (combined.length >= 4) return combined.slice(0, 280)
  }
  const cleaned = t
    .replace(/^\d+(?:\.\d+)?\s*/, '')
    .replace(/复制打开抖音[，,]?/g, '')
    .replace(/^看看/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.length >= 4 ? cleaned.slice(0, 280) : ''
}

/** 云剪 AI 核查：多源拉取作品文案（页面/API + 分享口令兜底） */
export async function fetchDouyinPublishCaptionText(
  normalizedUrl: string,
  rawShareInput?: string,
): Promise<string> {
  const videoId = extractDouyinVideoId(normalizedUrl)
  const ctx = await loadDouyinMediaContext(normalizedUrl, videoId)
  for (const candidate of [ctx.caption, ctx.title, ctx.description, ctx.awemeItem?.desc]) {
    if (!candidate) continue
    const text = stripDouyinMetaBoilerplate(String(candidate))
    if (text.length >= 6) return text.slice(0, 280)
  }
  return extractDouyinShareCaptionText(String(rawShareInput || ''))
}

export type DouyinPublishMediaContext = {
  playUrl: string | null
  captionText: string
  videoDurationMs: number | null
}

/** 发布链接核查：拉取抖音作品播放地址与文案 */
export async function fetchDouyinPublishMediaContext(
  normalizedUrl: string,
  rawShareInput?: string,
): Promise<DouyinPublishMediaContext> {
  const videoId = extractDouyinVideoId(normalizedUrl)
  const ctx = await loadDouyinMediaContext(normalizedUrl, videoId)
  const captionText = (await fetchDouyinPublishCaptionText(normalizedUrl, rawShareInput)) || ''
  return {
    playUrl: ctx.playUrl,
    captionText,
    videoDurationMs: ctx.videoDurationMs,
  }
}

/** 远程视频 ASR（OSS 成片 / 抖音 playUrl 均可） */
export async function transcribeRemoteVideoAudio(
  mediaUrl: string,
  env: Record<string, string>,
  videoDurationMs?: number | null,
): Promise<string | null> {
  const detailed = await transcribeRemoteVideoAudioDetailed(mediaUrl, env, videoDurationMs)
  return detailed?.text && detailed.text.length >= 8 ? detailed.text : null
}

/** 远程视频 ASR（含句级时间轴，供合规定位） */
export async function transcribeRemoteVideoAudioDetailed(
  mediaUrl: string,
  env: Record<string, string>,
  videoDurationMs?: number | null,
): Promise<RemoteVideoAsrDetailed | null> {
  return transcribeDouyinVideoAudioDetailed(mediaUrl, env, videoDurationMs)
}

/** 抖音 CDN 视频下载（供尾帧比对） */
export async function downloadDouyinVideoBufferForVerify(
  playUrl: string,
  timeoutMs = 28_000,
): Promise<Buffer | null> {
  return downloadDouyinMediaBuffer(playUrl, timeoutMs)
}

function parseAiJsonBlock(text: string): { script?: string; motionInstructions?: string } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const raw = (fenced?.[1] ?? text).trim()
  try {
    const j = JSON.parse(raw) as { script?: string; motionInstructions?: string }
    if (j && typeof j === 'object') return j
  } catch {
    /* fall through */
  }
  return null
}

function defaultMotionInstructions(): string {
  return [
    '[0-3s] 开场：微笑注视镜头，轻微点头',
    '[3-10s] 手势：单手强调关键词，半身构图',
    '[10-结束] 结尾：双手合十或指向左下角引导互动',
  ].join('\n')
}

function formatLinkParseAiError(raw: string): string {
  const t = raw.trim()
  if (!t) return 'AI 解析失败，请稍后重试'
  if (/auth_lookup_failed|supabase_anon_not_configured/i.test(t)) {
    return '无法校验登录态。请在 ECS auth-api 配置 SUPABASE_JWT_SECRET（与 ~/stack/db-credentials.txt 中 JWT_SECRET 一致），商户前端 Vercel 也需配置同名 SUPABASE_JWT_SECRET 后 Redeploy。'
  }
  if (/tokenmix_not_configured|未配置.*api key|not_configured|no.*key/i.test(t) && !/fetch failed/i.test(t)) {
    return '未配置可用 AI 密钥。请在商家管理后台「AI 模型」保存通义（千问）/ 豆包 / MiniMax 至少一项（与智能体共用），保存后无需改商户端。'
  }
  if (/fetch failed|failed to fetch|econnrefused|enotfound|etimedout|502|erp-api|503/i.test(t)) {
    return '无法连接 AI 服务。请确认已登录；AI Key 请在商家管理后台「AI 模型」保存（与智能体共用），并确认 ECS 已启动 meoo-auth-api（https://mofangdianai.com/erp-api/meoo-erp-api-health）。'
  }
  if (/unauthorized|invalid_jwt|auth_lookup|supabase_anon/i.test(t)) {
    return '登录已失效。请重新登录；若仍失败请检查 ECS/Vercel 的 SUPABASE_JWT_SECRET 与运营台配置。'
  }
  if (/tenant_not_found/i.test(t)) {
    return '未找到租户，无法调用 AI。请确认账号已完成商户注册；生产环境请走 erp-api（勿将 SUPABASE_URL 指到 127.0.0.1）。'
  }
  if (/plan_model_restricted|free_ai_quota|tokenmix_not_configured/i.test(t)) {
    return t
  }
  if (/未配置.*API Key|not_configured|401|invalid api key/i.test(t)) {
    return t.includes('运营') ? t : `${t} 请在商家管理后台配置通义/豆包/MiniMax Key 后重试。`
  }
  return t.slice(0, 400)
}

/** 链接口播解析固定走豆包（与智能体同源 Key） */
const LINK_PARSE_AI_PROVIDERS: Array<{ provider: 'doubao'; model?: string }> = [{ provider: 'doubao' }]

/** 与 /api/meoo-ai-chat 同源：运营台 vendorKeys + 租户权益 + routeAiChat */
async function generateLinkParseContent(
  prompt: string,
  env: Record<string, string>,
  authHeader?: string,
  tenantIdHint?: string,
): Promise<{ ok: true; content: string } | { ok: false; message: string }> {
  const system = 'You are a helpful assistant that outputs strict JSON only.'
  let lastErr = 'AI 解析失败，请稍后重试'

  for (const { provider, model } of LINK_PARSE_AI_PROVIDERS) {
    const bodyRaw = JSON.stringify({
      provider,
      ...(model ? { model } : {}),
      ...(tenantIdHint ? { tenantId: tenantIdHint } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    })
    const out = await runMeooAiChatCore(bodyRaw, authHeader, env)
    if (out.status === 200 && out.body.ok === true && typeof out.body.content === 'string') {
      const text = out.body.content.trim()
      if (text) return { ok: true, content: text }
    }
    const parts = [
      typeof out.body.error === 'string' ? out.body.error : '',
      typeof out.body.detail === 'string' ? out.body.detail : '',
      typeof out.body.hint === 'string' ? out.body.hint : '',
      typeof out.body.message === 'string' ? out.body.message : '',
    ].filter(Boolean)
    if (parts.length) lastErr = parts.join(' — ')
    if (out.status === 401) {
      return { ok: false, message: '请先登录后再使用链接抓取' }
    }
    if (out.status === 503 && /auth_lookup_failed/i.test(lastErr)) {
      return {
        ok: false,
        message: formatLinkParseAiError(lastErr),
      }
    }
  }

  return { ok: false, message: formatLinkParseAiError(lastErr) }
}

function parseMotionFromAi(content: string): string {
  const parsed = parseAiJsonBlock(content)
  if (parsed?.motionInstructions?.trim()) return parsed.motionInstructions.trim()
  const motionMatch = /"motionInstructions"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
  if (motionMatch?.[1]) return unescapeJsonString(motionMatch[1]).trim()
  const plain = content.replace(/```[\s\S]*?```/g, '').trim()
  if (plain.includes('[0-') || plain.includes('s]')) return plain
  return ''
}

const MOTION_INFER_TIMEOUT_MS = 22_000

async function inferMotionInstructionsFromScript(
  script: string,
  env: Record<string, string>,
  authHeader?: string,
  tenantIdHint?: string,
): Promise<string> {
  const prompt = `你是数字人口播导演。以下是从抖音短视频提取/还原的口播文案，请**仅**根据这段文案推断数字人动作指令（不要改写口播文案）。

口播文案：
${script}

请严格输出 JSON（不要 markdown），格式：
{"motionInstructions":"按时间轴每行一条，如 [0-3s] 半身镜头微笑点头；与文案节奏、手势、表情对应"}`

  try {
    const aiOut = await Promise.race([
      generateLinkParseContent(prompt, env, authHeader, tenantIdHint),
      new Promise<{ ok: false; message: string }>((resolve) => {
        setTimeout(() => resolve({ ok: false, message: 'motion_timeout' }), MOTION_INFER_TIMEOUT_MS)
      }),
    ])
    if (!aiOut.ok) return defaultMotionInstructions()
    const motion = parseMotionFromAi(aiOut.content)
    return motion.trim() || defaultMotionInstructions()
  } catch {
    return defaultMotionInstructions()
  }
}

function parseScriptFromAi(content: string): string {
  const parsed = parseAiJsonBlock(content)
  if (parsed?.script?.trim()) return parsed.script.trim()
  const scriptMatch = /"script"\s*:\s*"((?:\\.|[^"\\])*)"/s.exec(content)
  if (scriptMatch?.[1]) return unescapeJsonString(scriptMatch[1]).trim()
  return ''
}

async function extractScriptAndMotionWithDoubao(
  page: DouyinPageExtract,
  normalizedUrl: string,
  videoId: string | null,
  rawUserText: string,
  env: Record<string, string>,
  authHeader?: string,
  tenantIdHint?: string,
): Promise<
  | { script: string; motionInstructions: string }
  | { ok: false; message: string }
> {
  const prompt = `你是抖音短视频口播还原助手（豆包）。用户粘贴了分享链接或口令，请结合链接与页面抓取信息，还原视频中人物**实际说出**的口播原文。

用户粘贴原文：
${rawUserText.trim()}

解析链接：${normalizedUrl}
视频ID：${videoId ?? '未知'}
页面标题（勿当作口播）：${page.title ?? '未抓取到'}
发布文案 desc（勿直接照搬，多为标题/引流）：${page.awemeItem?.desc ?? page.description ?? '未抓取到'}
嵌入字幕/文案：${page.caption ?? '未抓取到'}
章节信息：${page.awemeItem?.chapter_list?.map((c) => c.title || c.desc || c.content).filter(Boolean).join('；') || '无'}

规则：
1. script 必须是口播正文，优先长句、完整表达；仅有「长按复制」「打开抖音」等分享口令而无口播时，script 留空
2. 不得把发布标题、话题标签、引流句当作完整口播
3. motionInstructions 写数字人动作/镜头/表情时间轴

请严格输出 JSON（不要 markdown）：
{"script":"...","motionInstructions":"..."}`

  const aiOut = await generateLinkParseContent(prompt, env, authHeader, tenantIdHint)
  if (!aiOut.ok) return { ok: false, message: aiOut.message }

  const content = aiOut.content
  let script = parseScriptFromAi(content)
  let motionInstructions = parseMotionFromAi(content)

  if (/insufficient_source/i.test(motionInstructions) || /insufficient_source/i.test(content)) {
    return {
      ok: false,
      message: '豆包未能从该链接还原口播，请换完整视频链接或改用手动输入/文本驱动',
    }
  }

  if (script.length < 12) {
    return {
      ok: false,
      message: '豆包未能还原有效口播文案，请换链接或改用手动输入/文本驱动',
    }
  }

  if (!motionInstructions || /insufficient/i.test(motionInstructions)) {
    motionInstructions = await inferMotionInstructionsFromScript(script, env, authHeader, tenantIdHint)
  }

  return { script, motionInstructions }
}

export async function runDouyinLinkParseCore(
  input: DouyinLinkParseInput,
  env: Record<string, string>,
  authHeader?: string,
): Promise<DouyinLinkParseResult> {
  const share = extractDouyinShareFromText(input.url)
  const extracted =
    share.url ?? (share.videoId ? `https://www.douyin.com/video/${share.videoId}` : null)
  if (!extracted) {
    return {
      ok: false,
      message:
        '未从分享口令中识别到抖音链接。请粘贴抖音「分享」复制的整段文案（含 https://v.douyin.com/… 或 /video/ 链接），或改用手动输入/文本驱动。',
    }
  }

  const resolved = await resolveDouyinLinkTarget(extracted)
  let normalizedUrl = normalizeDouyinShareUrl(resolved.url) ?? extracted
  let videoId = share.videoId ?? resolved.videoId ?? extractDouyinVideoId(normalizedUrl)
  let linkKind: DouyinLinkKind = videoId ? 'video' : resolved.linkKind

  if (videoId && (linkKind === 'user_profile' || isDouyinUserProfileUrl(normalizedUrl))) {
    normalizedUrl = `https://www.douyin.com/video/${videoId}`
    linkKind = 'video'
  }

  const kindError = douyinLinkKindErrorMessage(linkKind, resolved.shortLinkUnresolved, extracted)
  if (kindError) {
    return { ok: false, message: kindError }
  }

  const page = await loadDouyinMediaContext(normalizedUrl, videoId)

  if (!videoId && !page.playUrl) {
    return {
      ok: false,
      message: `已从分享口令识别链接：${extracted}。未能获取视频地址，请确认分享的是视频口令（非达人主页），或改用手动输入/文本驱动。`,
    }
  }

  const durationMs = page.videoDurationMs ?? 0
  const asrKey = readDashScopeAsrKey(env)
  const tenantIdHint = input.tenantId?.trim()

  if (page.playUrl && !asrKey) {
    return {
      ok: false,
      message:
        '已解析到视频，但未配置通义 ASR Key（MERCHANT_AI_QWEN_KEY / DASHSCOPE_API_KEY）。请在商家管理后台「AI 模型」保存通义 Key，或在 ECS/Vercel 环境变量配置后重试。',
    }
  }

  if (page.playUrl && asrKey) {
    if (durationMs > MAX_DOUYIN_VIDEO_MS) {
      const mins = Math.ceil(durationMs / 60_000)
      const maxMins = Math.floor(MAX_DOUYIN_VIDEO_MS / 60_000)
      return {
        ok: false,
        message: `视频约 ${mins} 分钟，超过当前支持的 ${maxMins} 分钟上限。请换更短视频或改用手动输入/文本驱动`,
      }
    }

    const asrScript = await transcribeDouyinVideoAudio(page.playUrl, env, durationMs)
    if (asrScript && asrScript.length >= 12) {
      const motionInstructions = await inferMotionInstructionsFromScript(
        asrScript,
        env,
        authHeader,
        tenantIdHint,
      )
      return {
        ok: true,
        normalizedUrl,
        videoId,
        sourceTitle: page.title,
        script: asrScript,
        motionInstructions,
        scriptSource: 'asr',
      }
    }
  }

  const aiResult = await extractScriptAndMotionWithDoubao(
    page,
    normalizedUrl,
    videoId,
    input.url,
    env,
    authHeader,
    tenantIdHint,
  )
  if ('ok' in aiResult) {
    return { ok: false, message: aiResult.message }
  }

  return {
    ok: true,
    normalizedUrl,
    videoId,
    sourceTitle: page.title,
    script: aiResult.script,
    motionInstructions: aiResult.motionInstructions.trim() || defaultMotionInstructions(),
    scriptSource: 'ai_extract',
  }
}
