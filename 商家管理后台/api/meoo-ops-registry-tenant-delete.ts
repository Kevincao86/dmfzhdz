/**
 * POST /api/meoo-ops-registry-tenant-delete — Vercel 运营台 307 至 erp-api
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redirectRegistryToErpApi } from './opsErpApiRedirect.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.status(204).end()
    return
  }
  redirectRegistryToErpApi(res, '/api/meoo-ops-registry-tenant-delete')
}
