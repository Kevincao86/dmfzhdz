/**
 * 视频二进制 API 直连写回（绕过 node-mocks-http，避免 MP4 变 0 字节）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { rawBody, sendMerchantJson } from './merchantGatewayShared.js'
import { mergeVideoAiMerchantEnvWithSnapshot } from '../../vite-plugins/merchantVideoAiGateway.js'
import { fetchRemoteVideoBuffer } from '../../vite-plugins/videoDownloadProxyCore.js'
import { concatLocalMp4Buffers, concatRemoteMp4Urls, extractLastFrameJpegFromUrl, muxLocalVideoAudio, postProcessLocalVideo } from '../../vite-plugins/videoConcatServer.js'

function readBearer(env: Record<string, string | undefined>): string | undefined {
  const t = (env.MERCHANT_AI_DOUBAO_KEY ?? env.ARK_API_KEY ?? '').trim()
  return t || undefined
}

export async function handleVideoDownloadUrlDirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: '请求体必须为 JSON。' })
    return
  }

  const urlStr = typeof parsed.url === 'string' ? parsed.url.trim() : ''
  if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少有效的 http(s) URL。' })
    return
  }

  const env = await mergeVideoAiMerchantEnvWithSnapshot(process.cwd(), process.env as Record<string, string>)
  const fetched = await fetchRemoteVideoBuffer(urlStr, { bearer: readBearer(env) })
  if (!fetched.ok) {
    sendMerchantJson(res, 502, { ok: false, message: fetched.message })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', String(fetched.buffer.length))
  res.setHeader('Cache-Control', 'private, max-age=120')
  res.send(fetched.buffer)
}

export async function handleVideoLastFrameDirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: '请求体必须为 JSON。' })
    return
  }

  const urlStr = typeof parsed.url === 'string' ? parsed.url.trim() : ''
  if (!urlStr || !/^https?:\/\//i.test(urlStr)) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少有效的 http(s) URL。' })
    return
  }

  const env = await mergeVideoAiMerchantEnvWithSnapshot(process.cwd(), process.env as Record<string, string>)
  const extracted = await extractLastFrameJpegFromUrl(urlStr, { bearer: readBearer(env) })
  if (!extracted.ok) {
    sendMerchantJson(res, 502, { ok: false, message: extracted.message })
    return
  }

  sendMerchantJson(res, 200, {
    ok: true,
    imageBase64: extracted.buffer.toString('base64'),
  })
}

export async function handleVideoConcatUrlsDirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: '请求体必须为 JSON。' })
    return
  }

  const rawUrls = parsed.urls
  const urls = Array.isArray(rawUrls)
    ? rawUrls.map((x) => String(x).trim()).filter((u) => /^https?:\/\//i.test(u))
    : []
  if (urls.length < 2) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少至少 2 个有效视频 URL。' })
    return
  }

  const merged = await concatRemoteMp4Urls(urls)
  if (!merged.ok) {
    sendMerchantJson(res, 502, { ok: false, message: merged.message })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', String(merged.buffer.length))
  res.send(merged.buffer)
}

export async function handleVideoConcatBlobsDirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: '请求体必须为 JSON。' })
    return
  }

  const rawSegs = parsed.segments
  if (!Array.isArray(rawSegs) || rawSegs.length < 2) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少至少 2 段 base64 视频片段。' })
    return
  }

  const buffers: Buffer[] = []
  for (let i = 0; i < rawSegs.length; i++) {
    const b64 = String(rawSegs[i] ?? '').trim()
    if (!b64) {
      sendMerchantJson(res, 400, { ok: false, message: `第 ${i + 1} 段为空` })
      return
    }
    try {
      const buf = Buffer.from(b64, 'base64')
      if (buf.length > 80 * 1024 * 1024) {
        sendMerchantJson(res, 400, { ok: false, message: `第 ${i + 1} 段过大` })
        return
      }
      buffers.push(buf)
    } catch {
      sendMerchantJson(res, 400, { ok: false, message: `第 ${i + 1} 段 base64 无效` })
      return
    }
  }

  const merged = await concatLocalMp4Buffers(buffers)
  if (!merged.ok) {
    sendMerchantJson(res, 502, { ok: false, message: merged.message })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', String(merged.buffer.length))
  res.send(merged.buffer)
}

export async function handleVideoMuxAudioDirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: '请求体必须为 JSON。' })
    return
  }

  const videoB64 = String(parsed.videoBase64 ?? '').trim()
  const audioB64 = String(parsed.audioBase64 ?? '').trim()
  if (!videoB64 || !audioB64) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少 videoBase64 或 audioBase64' })
    return
  }

  let videoBuf: Buffer
  let audioBuf: Buffer
  try {
    videoBuf = Buffer.from(videoB64, 'base64')
    audioBuf = Buffer.from(audioB64, 'base64')
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: 'base64 无效' })
    return
  }

  const merged = await muxLocalVideoAudio(videoBuf, audioBuf)
  if (!merged.ok) {
    sendMerchantJson(res, 502, { ok: false, message: merged.message })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', String(merged.buffer.length))
  res.send(merged.buffer)
}

export async function handleVideoPostProcessDirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if ((req.method ?? 'POST').toUpperCase() !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: '请求体必须为 JSON。' })
    return
  }

  const videoB64 = String(parsed.videoBase64 ?? '').trim()
  if (!videoB64) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少 videoBase64' })
    return
  }

  const srtContent = typeof parsed.srtContent === 'string' ? parsed.srtContent : undefined
  const subtitleStyle = typeof parsed.subtitleStyle === 'string' ? parsed.subtitleStyle : undefined
  const productB64 = String(parsed.productImageBase64 ?? '').trim()
  const subtleMotion = parsed.subtleMotion === true || parsed.subtleMotion === '1' || parsed.subtleMotion === 1
  const gesturePreset =
    typeof parsed.gesturePreset === 'string' ? parsed.gesturePreset.trim() : undefined

  if (!srtContent?.trim() && !productB64 && !subtleMotion) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少 srtContent、productImageBase64 或 subtleMotion' })
    return
  }

  let videoBuf: Buffer
  let productImageBuf: Buffer | undefined
  try {
    videoBuf = Buffer.from(videoB64, 'base64')
    if (productB64) {
      productImageBuf = Buffer.from(productB64, 'base64')
    }
  } catch {
    sendMerchantJson(res, 400, { ok: false, message: 'base64 无效' })
    return
  }

  const processed = await postProcessLocalVideo(videoBuf, {
    srtContent,
    subtitleStyle,
    productImageBuf,
    subtleMotion,
    gesturePreset,
  })
  if (!processed.ok) {
    sendMerchantJson(res, 502, { ok: false, message: processed.message })
    return
  }

  res.status(200)
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Content-Length', String(processed.buffer.length))
  res.send(processed.buffer)
}
