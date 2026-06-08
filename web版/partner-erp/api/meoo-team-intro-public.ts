/**
 * 服务商站 fws：同源 /api/meoo-team-intro-public → ECS erp-api
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const UPSTREAM = 'https://mofangdianai.com/erp-api/meoo-team-intro-public'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.status(204).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }
  try {
    const upstream = await fetch(UPSTREAM, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(body)
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: 'team_intro_proxy_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
