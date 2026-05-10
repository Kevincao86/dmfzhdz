/**
 * 本地 dev / preview：/api/merchant 路由（逻辑见 merchantApiGatewayCore.ts；Vercel 同源复用）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from 'vite'
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'
import { handleMerchantApiGatewayCore } from './merchantApiGatewayCore'

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
    if (!raw.startsWith('/api/merchant/')) {
      next()
      return
    }

    const host = req.headers.host ?? 'localhost'
    const url = new URL(raw, `http://${host}`)
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
