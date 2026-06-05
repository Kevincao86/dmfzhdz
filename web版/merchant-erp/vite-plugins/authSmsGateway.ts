import type { IncomingMessage } from 'node:http'
import type { VercelRequest } from '@vercel/node'
import type { Plugin } from 'vite'
import smsSendHandler from '../api/meoo-auth-sms-send.js'
import { applyViteEnvDirs } from './mpDevEnv.js'
import { createMockVercelResponse } from './vercelMockResponse.js'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Vite dev：/api/meoo-auth-sms-send */
export function authSmsGatewayPlugin(opts?: { extraEnvDirs?: string[] }): Plugin {
  return {
    name: 'auth-sms-gateway',
    configResolved(config) {
      applyViteEnvDirs(config.mode, [config.root, ...(opts?.extraEnvDirs ?? [])])
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        const path = rawUrl.split('?')[0]
        if (path !== '/api/meoo-auth-sms-send') return next()

        const method = req.method ?? 'GET'
        if (method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
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
        } as unknown as VercelRequest

        const { mockRes, setStatus } = createMockVercelResponse(res)

        try {
          await smsSendHandler(mockReq, mockRes)
        } catch (e) {
          setStatus(500)
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              ok: false,
              error: 'auth_sms_gateway_failed',
              detail: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })
    },
  }
}
