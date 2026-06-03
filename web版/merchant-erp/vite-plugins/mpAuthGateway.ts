import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv, type Plugin } from 'vite'
import mpAuthHandler from '../api/meoo-ops-mp-auth.js'

function applyViteEnvToProcess(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    if (value && !(process.env[key] ?? '').trim()) process.env[key] = value
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

/** Vite dev：/api/meoo-ops-mp-auth */
export function mpAuthGatewayPlugin(): Plugin {
  return {
    name: 'mp-auth-gateway',
    configResolved(config) {
      applyViteEnvToProcess(loadEnv(config.mode, config.root, ''))
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        const path = rawUrl.split('?')[0]
        if (path !== '/api/meoo-ops-mp-auth') return next()

        const method = req.method ?? 'GET'
        if (method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
          res.end()
          return
        }

        const body = method === 'POST' ? await readBody(req) : ''
        const url = new URL(rawUrl, 'http://127.0.0.1')
        const query: Record<string, string | string[]> = {}
        url.searchParams.forEach((v, k) => {
          query[k] = v
        })

        const mockReq = {
          method,
          url: rawUrl,
          query,
          headers: req.headers,
          body,
        } as never

        const mockRes = {
          statusCode: 200,
          _headers: {} as Record<string, string>,
          setHeader(k: string, v: string) {
            this._headers[k.toLowerCase()] = v
            res.setHeader(k, v)
          },
          status(code: number) {
            this.statusCode = code
            return this
          },
          end(payload: string) {
            res.statusCode = this.statusCode
            res.end(payload)
          },
        } as never

        try {
          await mpAuthHandler(mockReq, mockRes)
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              ok: false,
              error: 'mp_auth_gateway_failed',
              detail: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })
    },
  }
}
