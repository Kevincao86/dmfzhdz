import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  sendMerchantJson,
} from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 120 }

/**
 * 成片下载：直连 OSS 后以 Buffer 写回 Vercel Response。
 * 勿经 node-mocks-http 转发，否则 MP4 二进制易变成 0 字节空文件。
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')

  if ((req.method ?? 'GET').toUpperCase() !== 'GET') {
    sendMerchantJson(res, 405, { ok: false, message: 'Method Not Allowed' })
    return
  }

  const urlStr = typeof req.url === 'string' ? req.url : ''
  const url = new URL(urlStr, 'http://localhost')
  const jobId = url.searchParams.get('id')?.trim()
  if (!jobId) {
    sendMerchantJson(res, 400, { ok: false, message: '缺少 id' })
    return
  }

  const { fetchIceJobDownloadBuffer, loadIceGatewayConfig } = await import(
    '../vite-plugins/aliyunIceGateway.js'
  )
  const cfg = await loadIceGatewayConfig(process.cwd(), process.env as Record<string, string>)
  if (!cfg) {
    sendMerchantJson(res, 503, { ok: false, message: '墨典AI云剪未配置' })
    return
  }

  const payload = await fetchIceJobDownloadBuffer(cfg, jobId)
  if (!payload.ok) {
    sendMerchantJson(res, payload.status, { ok: false, message: payload.message })
    return
  }

  const inline = url.searchParams.get('inline') === '1'
  const total = payload.buf.length
  const rangeHeader = req.headers?.range
  res.setHeader('Content-Type', 'video/mp4')
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader(
    'Content-Disposition',
    inline ? `inline; filename="ice-${jobId}.mp4"` : `attachment; filename="ice-${jobId}.mp4"`,
  )
  res.setHeader('Cache-Control', 'private, max-age=300')

  if (inline && typeof rangeHeader === 'string') {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
    if (m) {
      const start = m[1] ? Number.parseInt(m[1], 10) : 0
      const end = m[2] ? Number.parseInt(m[2], 10) : total - 1
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end >= start &&
        end < total
      ) {
        const chunk = payload.buf.subarray(start, end + 1)
        res.status(206)
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
        res.setHeader('Content-Length', String(chunk.length))
        res.send(chunk)
        return
      }
    }
  }

  res.status(200)
  res.setHeader('Content-Length', String(total))
  res.send(payload.buf)
}
