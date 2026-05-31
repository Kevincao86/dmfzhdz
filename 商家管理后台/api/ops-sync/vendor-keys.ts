/**
 * POST /api/ops-sync/vendor-keys — 307 到 ECS erp-api（保存各厂商 Key）。
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
    redirectRegistryToErpApi(res, '/api/ops-sync/vendor-keys')
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
}
