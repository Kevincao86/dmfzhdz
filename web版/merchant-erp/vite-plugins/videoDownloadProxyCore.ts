/**
 * 远程 MP4 拉取（数字人口播 / 可灵 / 豆包成片下载代理共用）。
 * 勿经 node-mocks-http 转发二进制响应，否则客户端易收到 0 字节空文件。
 */
import { bufferLooksLikeVideo } from './videoConcatServer.js'

export const VIDEO_PROXY_MAX_BYTES = 100 * 1024 * 1024
/** 单段远程 MP4 拉取上限（含连接 + 读流），避免 CDN 挂死拖垮长视频拼接 */
export const REMOTE_VIDEO_FETCH_TIMEOUT_MS = 60_000
const MAX_ATTEMPTS = 4

function remoteFetchSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

async function readUpstreamBuffer(upstream: Response, timeoutMs: number): Promise<Buffer> {
  const chunk = await Promise.race([
    upstream.arrayBuffer(),
    new Promise<ArrayBuffer>((_, reject) => {
      setTimeout(
        () => reject(new Error(`读取视频流超时（${Math.round(timeoutMs / 1000)} 秒）`)),
        timeoutMs,
      )
    }),
  ])
  return Buffer.from(chunk)
}

function buildFetchHeaders(urlStr: string, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'meoo-merchant-erp-video-proxy/1.2',
    Accept: 'video/mp4,video/*,application/octet-stream,*/*',
    ...extra,
  }
  try {
    const host = new URL(urlStr).hostname.toLowerCase()
    if (/volces\.com|volccdn\.com|byteimg\.com|bytedance\.com|tos-/i.test(host)) {
      h.Referer = 'https://www.volcengine.com/'
    }
    if (/aliyuncs\.com|dashscope/i.test(host)) {
      h.Referer = 'https://dashscope.aliyuncs.com/'
    }
  } catch {
    /* ignore */
  }
  return h
}

export async function fetchRemoteVideoBuffer(
  urlStr: string,
  opts?: { bearer?: string },
): Promise<{ ok: true; buffer: Buffer } | { ok: false; message: string }> {
  const trimmed = urlStr.trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return { ok: false, message: '缺少有效的 http(s) URL。' }
  }

  let lastMsg = '下载失败'
  const headerVariants: Record<string, string>[] = [buildFetchHeaders(trimmed)]
  if (opts?.bearer?.trim()) {
    headerVariants.push({
      ...buildFetchHeaders(trimmed),
      Authorization: `Bearer ${opts.bearer.trim()}`,
    })
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt))
    const headers = headerVariants[Math.min(attempt, headerVariants.length - 1)]!

    let upstream: Response
    try {
      upstream = await fetch(trimmed, {
        redirect: 'follow',
        headers,
        signal: remoteFetchSignal(REMOTE_VIDEO_FETCH_TIMEOUT_MS),
      })
    } catch (e) {
      const raw = e instanceof Error ? e.message : '下载失败'
      lastMsg = /abort|timeout|timed out/i.test(raw)
        ? `下载超时（${Math.round(REMOTE_VIDEO_FETCH_TIMEOUT_MS / 1000)} 秒），CDN 可能未响应`
        : raw
      continue
    }

    if (!upstream.ok) {
      lastMsg = `下载失败 HTTP ${upstream.status}`
      continue
    }

    const len = upstream.headers.get('content-length')
    if (len && Number(len) > VIDEO_PROXY_MAX_BYTES) {
      return { ok: false, message: '视频文件过大。' }
    }

    let chunk: Buffer
    try {
      chunk = await readUpstreamBuffer(upstream, REMOTE_VIDEO_FETCH_TIMEOUT_MS)
    } catch (e) {
      lastMsg = e instanceof Error ? e.message : '读取视频流失败'
      continue
    }
    if (chunk.length > VIDEO_PROXY_MAX_BYTES) {
      return { ok: false, message: '视频文件过大。' }
    }
    if (chunk.length < 1024) {
      lastMsg = `成片尚未就绪（${chunk.length} 字节）`
      continue
    }
    if (!bufferLooksLikeVideo(chunk)) {
      lastMsg = '拉取到的不是有效视频文件（可能为封面图或错误页）'
      continue
    }
    return { ok: true, buffer: chunk }
  }

  return { ok: false, message: lastMsg }
}
