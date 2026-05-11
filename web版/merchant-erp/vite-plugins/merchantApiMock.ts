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
