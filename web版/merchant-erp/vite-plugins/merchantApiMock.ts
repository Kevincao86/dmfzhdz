/**
 * 本地 dev / preview：/api/merchant 路由（逻辑见 merchantApiGatewayCore.ts；Vercel 同源复用）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { runDouyinMerchantBind } from '../api/merchant/douyin/bindRuntime.js'
import { handleMerchantApiGatewayCore } from './merchantApiGatewayCore.js'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function attach(middlewares: Connect.Server, env: Record<string, string>, viteRoot: string) {
  middlewares.use(async (req, res, next) => {
    const raw = req.url ?? ''
    const host = req.headers.host ?? 'localhost'
    const loc = new URL(raw, `http://${host}`)

    if (loc.pathname === '/api/douyin-bind') {
      const method = req.method ?? 'GET'
      if (method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Allow', 'POST, OPTIONS')
        res.end()
        return
      }
      if (method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ message: 'Method Not Allowed' }))
        return
      }
      try {
        const bodyRaw = await readBody(req as IncomingMessage)
        const r = await runDouyinMerchantBind(bodyRaw)
        res.statusCode = r.statusCode
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(r.body))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ message: msg || '抖音绑定处理异常' }))
      }
      return
    }

    if (loc.pathname === '/api/meoo-ai-agent-image') {
      const method = req.method ?? 'GET'
      if (method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.end()
        return
      }
      if (method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
        return
      }
      try {
        const bodyRaw = await readBody(req as IncomingMessage)
        const auth = req.headers['authorization']
        const parsed = JSON.parse(bodyRaw || '{}') as {
          prompt?: string
          preferred_vendor?: string
          reference_image?: string
          image_route?: string
          tokenmix_image_model?: string
        }
        const prompt = typeof parsed.prompt === 'string' ? parsed.prompt.trim() : ''
        if (!prompt) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ ok: false, error: 'prompt_required' }))
          return
        }
        const refRaw = typeof parsed.reference_image === 'string' ? parsed.reference_image.trim() : ''
        if (refRaw.length > 2_800_000) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ ok: false, error: 'reference_image_too_large' }))
          return
        }
        const referenceImage = refRaw.length > 0 ? refRaw : undefined
        const pv = typeof parsed.preferred_vendor === 'string' ? parsed.preferred_vendor.trim().toLowerCase() : ''
        const preferredVendor =
          pv === 'qwen' || pv === 'doubao' || pv === 'minimax' ? (pv as 'qwen' | 'doubao' | 'minimax') : undefined
        const routeRaw = typeof parsed.image_route === 'string' ? parsed.image_route.trim().toLowerCase() : ''
        const imageRoute = routeRaw === 'tokenmix' ? 'tokenmix' : 'builtin'
        const tokenmixImageModel =
          typeof parsed.tokenmix_image_model === 'string' ? parsed.tokenmix_image_model.trim() : undefined
        const { verifyBearerJwt } = await import('./aiGateway/authSupabase.js')
        const user = await verifyBearerJwt(typeof auth === 'string' ? auth : undefined, env)
        if (!user) {
          res.statusCode = 401
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
          return
        }
        const { runMeooAgentImageRequest } = await import('./meooAgentImageCore.js')
        const out = await runMeooAgentImageRequest(env, {
          prompt,
          referenceImage,
          preferredVendor,
          imageRoute,
          tokenmixImageModel,
        })
        res.statusCode = out.ok ? 200 : 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(
          JSON.stringify(
            out.ok ? out : { ok: false, error: 'image_generation_failed', detail: out.message },
          ),
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: false, error: 'meoo_ai_agent_image_failed', detail: msg.slice(0, 800) }))
      }
      return
    }

    if (loc.pathname === '/api/meoo-ai-chat') {
      const method = req.method ?? 'GET'
      if (method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        res.end()
        return
      }
      if (method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }))
        return
      }
      try {
        const bodyRaw = await readBody(req as IncomingMessage)
        const auth = req.headers['authorization']
        const { runMeooAiChatCore } = await import('./aiGateway/meooAiChatCore.js')
        const out = await runMeooAiChatCore(
          bodyRaw,
          typeof auth === 'string' ? auth : undefined,
          env,
        )
        res.statusCode = out.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(out.body))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: false, error: 'meoo_ai_chat_failed', detail: msg.slice(0, 800) }))
      }
      return
    }

    if (!raw.startsWith('/api/merchant/')) {
      next()
      return
    }

    const url = loc
    const pathname = url.pathname
    const method = req.method ?? 'GET'

    let bodyPromise: Promise<string> | null = null
    const bodyReader = () => {
      bodyPromise ??= readBody(req as IncomingMessage)
      return bodyPromise
    }

    const handled = await handleMerchantApiGatewayCore({
      method,
      pathname,
      url,
      req: req as IncomingMessage,
      res: res as ServerResponse,
      env,
      viteRoot,
      bodyReader,
    })
    if (handled) return
    next()
  })
}

export function merchantApiMockPlugin(): Plugin {
  let merchantEnv: Record<string, string> = {}
  let viteRoot = ''
  return {
    name: 'merchant-api-gateway',
    configResolved(config) {
      merchantEnv = loadEnv(config.mode, config.root, '')
      viteRoot = config.root
    },
    configureServer(server) {
      attach(server.middlewares, merchantEnv, viteRoot)
    },
    configurePreviewServer(server) {
      attach(server.middlewares, merchantEnv, viteRoot)
    },
  }
}
