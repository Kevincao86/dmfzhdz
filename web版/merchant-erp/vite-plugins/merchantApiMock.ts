/**
 * 本地 dev / preview：/api/merchant 路由（逻辑见 merchantApiGatewayCore.ts；Vercel 同源复用）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { runDouyinMerchantBind } from '../api/merchant/douyin/bindRuntime.js'
import { handleMerchantApiGatewayCore } from './merchantApiGatewayCore.js'
import { buildWeatherDailyReply } from '../src/lib/agentDailyInfoWeather.js'
import { runDouyinLinkParseCore } from '../src/lib/digitalHumanDouyinLinkCore.js'
import { runDigitalHumanTtsCore } from '../src/lib/digitalHumanTtsCore.js'
import { mergeMerchantAiEnvWithRegistrySnapshot } from './merchantRegistryVendorEnv.js'

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

    const storeIntelPaths = [
      '/api/meoo-store-menu-recognize',
      '/api/meoo-store-menu-excel-recognize',
      '/api/meoo-competitor-analysis',
      '/api/meoo-ai-product-plan',
    ] as const
    if (storeIntelPaths.includes(loc.pathname as (typeof storeIntelPaths)[number])) {
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
        const intel = await import('./merchantStoreIntelCore.js')
        const runners = {
          '/api/meoo-store-menu-recognize': intel.runStoreMenuRecognizeCore,
          '/api/meoo-store-menu-excel-recognize': intel.runStoreMenuExcelRecognizeCore,
          '/api/meoo-competitor-analysis': intel.runCompetitorAnalysisCore,
          '/api/meoo-ai-product-plan': intel.runAiProductPlanCore,
        } as const
        const run = runners[loc.pathname as keyof typeof runners]
        const out = await run(
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
        res.end(JSON.stringify({ ok: false, error: 'store_intel_failed', detail: msg.slice(0, 800) }))
      }
      return
    }

    if (loc.pathname === '/api/meoo-ops-mp-profile-link-parse') {
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
        const body = JSON.parse(bodyRaw || '{}') as { link?: string; platform?: string }
        const { runProfileLinkParseCore } = await import('../src/lib/profileLinkParseCore.js')
        const out = await runProfileLinkParseCore({
          link: String(body.link || ''),
          platform: body.platform,
        })
        res.statusCode = out.ok ? 200 : 422
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(out.ok ? out : { ok: false, error: 'profile_parse_failed', message: out.message }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: false, error: 'profile_parse_error', detail: msg.slice(0, 800) }))
      }
      return
    }

    if (loc.pathname === '/api/meoo-mp-recruitment-ai') {
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
        const { runMpRecruitmentAiCore } = await import('./mpRecruitmentAiCore.js')
        const out = await runMpRecruitmentAiCore(bodyRaw, env)
        res.statusCode = out.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(out.body))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify({ ok: false, error: 'mp_recruitment_ai_failed', detail: msg.slice(0, 800) }))
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
        let wantsStream = false
        try {
          const peek = JSON.parse(bodyRaw || '{}') as { stream?: boolean }
          wantsStream = peek.stream === true
        } catch {
          wantsStream = false
        }
        if (wantsStream) {
          const { runMeooAiChatStream } = await import('./aiGateway/meooAiChatStream.js')
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache, no-transform')
          res.setHeader('X-Accel-Buffering', 'no')
          res.setHeader('Access-Control-Allow-Origin', '*')
          await runMeooAiChatStream(
            bodyRaw,
            typeof auth === 'string' ? auth : undefined,
            env,
            (payload) => {
              if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`)
            },
          )
          if (!res.writableEnded) res.end()
          return
        }
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

    if (loc.pathname === '/api/meoo-agent-daily-info') {
      const method = req.method ?? 'GET'
      if (method === 'OPTIONS') {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
        res.end()
        return
      }
      if (method !== 'POST') {
        res.statusCode = 405
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, message: 'method_not_allowed' }))
        return
      }
      try {
        const bodyRaw = await readBody(req as IncomingMessage)
        const body = JSON.parse(bodyRaw || '{}') as { city?: string; dayOffset?: number }
        const out = await buildWeatherDailyReply(body)
        res.statusCode = out.ok ? 200 : 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(out.ok ? { ok: true, reply: out.reply } : { ok: false, message: out.message }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, message: msg.slice(0, 200) }))
      }
      return
    }

    if (loc.pathname === '/api/meoo-digital-human-douyin-link') {
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
        res.end(JSON.stringify({ ok: false, message: 'method_not_allowed' }))
        return
      }
      try {
        const bodyRaw = await readBody(req as IncomingMessage)
        const body = JSON.parse(bodyRaw || '{}') as { url?: string; tenantId?: string }
        const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
        const aiEnv = await mergeMerchantAiEnvWithRegistrySnapshot(viteRoot, env)
        const out = await runDouyinLinkParseCore(
          {
            url: String(body.url ?? ''),
            tenantId: typeof body.tenantId === 'string' ? body.tenantId : undefined,
          },
          aiEnv,
          auth,
        )
        res.statusCode = out.ok ? 200 : 422
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(out.ok ? out : { ok: false, message: out.message }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, message: msg.slice(0, 400) }))
      }
      return
    }

    if (loc.pathname === '/api/meoo-digital-human-tts') {
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
        res.end(JSON.stringify({ ok: false, message: 'method_not_allowed' }))
        return
      }
      try {
        const bodyRaw = await readBody(req as IncomingMessage)
        const body = JSON.parse(bodyRaw || '{}') as {
          text?: string
          voicePresetId?: string
          speechRate?: number
          speechPitch?: number
        }
        const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
        const aiEnv = await mergeMerchantAiEnvWithRegistrySnapshot(viteRoot, env)
        const out = await runDigitalHumanTtsCore(
          {
            text: String(body.text ?? ''),
            voicePresetId: String(body.voicePresetId ?? ''),
            speechRate: typeof body.speechRate === 'number' ? body.speechRate : undefined,
            speechPitch: typeof body.speechPitch === 'number' ? body.speechPitch : undefined,
          },
          aiEnv,
          auth,
        )
        res.statusCode = out.ok ? 200 : 422
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(out.ok ? out : { ok: false, message: out.message }))
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, message: msg.slice(0, 400) }))
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
      const merchantOverride = process.env.MEOO_MERCHANT_VITE_ROOT?.trim()
      viteRoot = merchantOverride || config.root
      merchantEnv = {
        ...loadEnv(config.mode, viteRoot, ''),
        ...loadEnv(config.mode, config.root, ''),
      }
    },
    configureServer(server) {
      attach(server.middlewares, merchantEnv, viteRoot)
    },
    configurePreviewServer(server) {
      attach(server.middlewares, merchantEnv, viteRoot)
    },
  }
}
