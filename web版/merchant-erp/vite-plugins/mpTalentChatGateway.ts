import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'
import { handleMpTalentChatBody, type MpTalentChatBody } from '../src/lib/mpTalentChatHandler.js'
import { handleMpSupportRelayBody, type MpSupportRelayBody } from '../src/lib/mpSupportRelayHandler.js'

/** Vite dev 中间件读 process.env；将 .env.local 合并进去（与 merchantApiMock 一致）。 */
function applyViteEnvToProcess(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    if (value && !(process.env[key] ?? '').trim()) {
      process.env[key] = value
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, data: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.statusCode = status
  res.end(JSON.stringify(data))
}

async function handleMpApiRoute(
  url: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (url === '/api/meoo-ops-mp-talent-chat') {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as MpTalentChatBody
    const out = await handleMpTalentChatBody(body)
    json(res, out.status, out.data)
    return true
  }
  if (url === '/api/meoo-ops-mp-support-relay') {
    const raw = await readBody(req)
    const body = JSON.parse(raw || '{}') as MpSupportRelayBody
    const out = await handleMpSupportRelayBody(body)
    json(res, out.status, out.data)
    return true
  }
  return false
}

/** 本地 Vite dev：达人招募小程序 API → Supabase */
export function mpTalentChatGatewayPlugin(): Plugin {
  return {
    name: 'mp-talent-chat-gateway',
    configResolved(config) {
      applyViteEnvToProcess(loadEnv(config.mode, config.root, ''))
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/api/meoo-ops-mp-talent-chat' && url !== '/api/meoo-ops-mp-support-relay') {
          return next()
        }

        const method = req.method ?? 'GET'
        if (method === 'OPTIONS') {
          json(res, 204, { ok: true })
          return
        }
        if (method !== 'POST') {
          json(res, 405, { ok: false, error: 'method_not_allowed' })
          return
        }

        try {
          const handled = await handleMpApiRoute(url, req, res)
          if (!handled) json(res, 404, { ok: false, error: 'not_found' })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          json(res, 500, {
            ok: false,
            error: 'meoo_ops_mp_api_failed',
            detail: msg.slice(0, 800),
          })
        }
      })
    },
  }
}
