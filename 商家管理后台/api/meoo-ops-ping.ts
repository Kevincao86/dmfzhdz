/**
 * 探活：浏览器访问 /api/meoo-ops-ping 应返回 JSON。
 * 若仍 FUNCTION_INVOCATION_FAILED，说明 Vercel 未正确部署本目录下 api 或 Root Directory 配置错误。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res
    .status(200)
    .send(JSON.stringify({ ok: true, route: 'meoo-ops-ping', ts: new Date().toISOString() }))
}
