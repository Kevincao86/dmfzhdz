/**
 * 历史 Vercel Serverless 反代（fws 已迁 ECS，Nginx 反代轻量 /api/）。
 * ECS 部署见 scripts/ecs-deploy-partner-fws-web.sh
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const UPSTREAM = 'https://mofangdianai.com/erp-api/meoo-help-manual-public'

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
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query || {})) {
    if (v == null) continue
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)))
    else qs.set(k, String(v))
  }
  const url = qs.size ? `${UPSTREAM}?${qs.toString()}` : UPSTREAM
  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' })
    const body = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(body)
  } catch (e) {
    res.status(502).json({
      ok: false,
      error: 'help_manual_proxy_failed',
      detail: e instanceof Error ? e.message : String(e),
    })
  }
}
