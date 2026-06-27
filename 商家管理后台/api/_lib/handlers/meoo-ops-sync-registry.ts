/**
 * GET /api/meoo-ops-sync-registry
 * 生产：307 到 ECS erp-api（Vercel 无法访问自建 Supabase）。
 * 本地 dev：仍可由 Vite 插件读写 .meoo-dev-sync（若请求打到本 handler 则同样跳转，dev 应走插件）。
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
  if (req.method === 'GET') {
    redirectRegistryToErpApi(res, '/api/meoo-ops-sync-registry')
    return
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(405).send(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
}
