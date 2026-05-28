/**
 * POST /api/meoo-agent-daily-info — 智能体日常：天气简报（wttr.in，无需 API Key）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { buildWeatherDailyReply } from '../src/lib/agentDailyInfoWeather'

export const config = { maxDuration: 15 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, message: 'method_not_allowed' })
    return
  }

  let body: { city?: string; dayOffset?: number; query?: string }
  try {
    const raw =
      typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : ''
    body = JSON.parse(raw || '{}') as { city?: string; dayOffset?: number }
  } catch {
    sendJson(res, 400, { ok: false, message: 'invalid_json' })
    return
  }

  const out = await buildWeatherDailyReply(body)
  if (out.ok) {
    sendJson(res, 200, { ok: true, reply: out.reply })
    return
  }
  sendJson(res, 502, { ok: false, message: out.message })
}
