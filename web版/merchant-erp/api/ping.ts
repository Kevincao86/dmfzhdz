/**
 * 路由探活：浏览器打开 https://<域名>/api/ping 应返回 JSON（若非 JSON 则说明 SPA/DNS 未指向本部署）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(200).send(JSON.stringify({ ok: true, service: 'merchant-erp', ts: Date.now() }))
}
