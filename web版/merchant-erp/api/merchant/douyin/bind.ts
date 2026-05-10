/**
 * 显式路由：部分 CDN / 托管对 catch-all 的 POST 返回 405，单独暴露绑定接口。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runDouyinMerchantBind } from '../../../vite-plugins/douyinMerchantGateway'

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return '{}'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS')
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).send(JSON.stringify({ message: 'Method Not Allowed' }))
    return
  }

  const r = await runDouyinMerchantBind(rawBody(req))
  res.status(r.statusCode).send(JSON.stringify(r.body))
}
