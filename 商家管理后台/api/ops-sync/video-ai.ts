/**
 * POST /api/ops-sync/video-ai — 307 到 ECS erp-api。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redirectRegistryToErpApi, sendErpApiRedirectCors } from '../opsErpApiRedirect.js'

export const config = { maxDuration: 10 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  sendErpApiRedirectCors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method === 'POST') {
    redirectRegistryToErpApi(res, '/api/ops-sync/video-ai')
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
}
