/**
 * GET/POST /api/meoo-planner-gpt-config — 方案规划器 Gpt 配置（跨设备共享，文件持久化）
 */
import fs from 'fs'
import path from 'path'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 30 }

const ADMIN_PASSWORD = 'kaiyedaji888'
const CONFIG_FILE = path.join(process.cwd(), 'data', 'planner-gpt-config.json')

type GptConfig = {
  apiKey?: string
  baseUrl?: string
  textModel?: string
  imageModel?: string
  updatedAt?: string
}

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  cors(res)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(status).send(JSON.stringify(body))
}

function readStored(): GptConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    const j = JSON.parse(raw) as GptConfig
    return j && typeof j === 'object' ? j : null
  } catch {
    return null
  }
}

function writeStored(cfg: GptConfig) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
}

function normalizeConfig(raw: GptConfig): GptConfig {
  return {
    apiKey: String(raw.apiKey || '').trim(),
    baseUrl: String(raw.baseUrl || 'https://api.tokenmix.ai/v1').trim(),
    textModel: String(raw.textModel || 'gpt-4o-mini').trim(),
    imageModel: String(raw.imageModel || 'dall-e-3').trim(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method === 'GET') {
    const stored = readStored()
    const hasKey = !!String(stored?.apiKey || '').trim()
    json(res, 200, {
      ok: true,
      connected: hasKey,
      config: hasKey ? stored : null,
      updatedAt: stored?.updatedAt ?? null,
    })
    return
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  let body: GptConfig & { adminPassword?: string }
  try {
    const raw =
      typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : '{}'
    body = JSON.parse(raw || '{}') as GptConfig & { adminPassword?: string }
  } catch {
    json(res, 400, { ok: false, error: 'invalid_json' })
    return
  }

  const existing = readStored()
  const hasExisting = !!String(existing?.apiKey || '').trim()
  if (hasExisting && body.adminPassword !== ADMIN_PASSWORD) {
    json(res, 403, { ok: false, error: 'password_required', message: '修改已有配置需管理密码' })
    return
  }

  const merged = normalizeConfig({
    apiKey: body.apiKey || existing?.apiKey || '',
    baseUrl: body.baseUrl || existing?.baseUrl || '',
    textModel: body.textModel || existing?.textModel || '',
    imageModel: body.imageModel || existing?.imageModel || '',
    updatedAt: new Date().toISOString(),
  })

  if (!merged.apiKey) {
    json(res, 400, { ok: false, error: 'api_key_required' })
    return
  }

  writeStored(merged)
  json(res, 200, { ok: true, connected: true, config: merged, updatedAt: merged.updatedAt })
}
