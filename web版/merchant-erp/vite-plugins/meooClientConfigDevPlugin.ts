/**
 * 本地 dev / preview：提供 /meoo-client-config.js 与 /api/meoo-erp-client-config，
 * 使无 .env.local 时也能走与线上一致的登录配置（Supabase 经 Vite 反代同源）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

type MeooClientRuntimeConfig = {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

const CS_FALLBACK_CONFIG_URL = 'https://cs.mofangdianai.com/meoo-client-config.js'

let cachedCsFallback: MeooClientRuntimeConfig | null | undefined

async function loadCsFallbackConfig(): Promise<MeooClientRuntimeConfig | null> {
  if (cachedCsFallback !== undefined) return cachedCsFallback
  try {
    const res = await fetch(CS_FALLBACK_CONFIG_URL, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      cachedCsFallback = null
      return null
    }
    const text = await res.text()
    const m = text.match(/window\.__MEOO_CLIENT_CONFIG__\s*=\s*(\{[\s\S]*?\})\s*;/)
    if (!m) {
      cachedCsFallback = null
      return null
    }
    const parsed = JSON.parse(m[1]) as MeooClientRuntimeConfig
    cachedCsFallback = {
      supabaseUrl: typeof parsed.supabaseUrl === 'string' ? parsed.supabaseUrl.trim() : undefined,
      supabaseAnonKey: typeof parsed.supabaseAnonKey === 'string' ? parsed.supabaseAnonKey.trim() : undefined,
    }
    return cachedCsFallback
  } catch {
    cachedCsFallback = null
    return null
  }
}

function devOriginFromRequest(req: IncomingMessage): string {
  const host = req.headers.host?.trim()
  if (host) return `http://${host}`
  return 'http://127.0.0.1:5173'
}

async function resolveDevClientConfig(
  env: Record<string, string>,
  devOrigin: string,
): Promise<MeooClientRuntimeConfig | null> {
  const fromEnvAnon = (env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? '').trim()
  const fromEnvUrl = (env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? '').trim()
  const fallback = await loadCsFallbackConfig()
  const supabaseAnonKey = fromEnvAnon || fallback?.supabaseAnonKey || ''
  if (!supabaseAnonKey) return null
  // 本地走 Vite 反代 /auth/v1、/rest/v1，Supabase 客户端须同源
  const supabaseUrl = fromEnvUrl && !/127\.0\.0\.1:8888|localhost:8888/.test(fromEnvUrl) ? fromEnvUrl : devOrigin
  return { supabaseUrl, supabaseAnonKey }
}

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(body))
}

function attach(middlewares: Connect.Server, env: Record<string, string>) {
  middlewares.use(async (req, res, next) => {
    const raw = req.url ?? ''
    const host = req.headers.host ?? '127.0.0.1:5173'
    const loc = new URL(raw, `http://${host}`)
    const pathname = loc.pathname

    if (pathname !== '/meoo-client-config.js' && pathname !== '/api/meoo-erp-client-config') {
      next()
      return
    }

    const cfg = await resolveDevClientConfig(env, devOriginFromRequest(req))
    if (!cfg?.supabaseAnonKey) {
      if (pathname === '/api/meoo-erp-client-config') {
        sendJson(res, 503, {
          ok: false,
          error: 'client_config_not_configured',
          missing: ['VITE_SUPABASE_ANON_KEY'],
          hint:
            '本地请在 web版/merchant-erp/.env.local 填入 VITE_SUPABASE_ANON_KEY，或确保可访问 cs.mofangdianai.com 拉取公网 anon key。',
        })
        return
      }
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end('// meoo-client-config: not configured\n')
      return
    }

    if (pathname === '/api/meoo-erp-client-config') {
      if ((req.method ?? 'GET') === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
        res.end()
        return
      }
      if ((req.method ?? 'GET') !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
        return
      }
      sendJson(res, 200, { ok: true, ...cfg })
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(`window.__MEOO_CLIENT_CONFIG__=${JSON.stringify(cfg)};\n`)
  })
}

export function meooClientConfigDevPlugin(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'meoo-client-config-dev',
    configResolved(config) {
      env = {
        ...loadEnv(config.mode, config.root, ''),
        ...loadEnv(config.mode, process.cwd(), ''),
      }
    },
    configureServer(server) {
      attach(server.middlewares, env)
    },
    configurePreviewServer(server) {
      attach(server.middlewares, env)
    },
  }
}
