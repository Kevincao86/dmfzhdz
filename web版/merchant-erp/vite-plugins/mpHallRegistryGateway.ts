import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv, type Plugin } from 'vite'
import mpHallRegistryHandler from '../api/meoo-ops-mp-hall-registry.js'
import { createMockVercelResponse } from './vercelMockResponse.js'

function applyViteEnvToProcess(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) {
    if (value && !(process.env[key] ?? '').trim()) process.env[key] = value
  }
}

/** Vite dev：GET /api/meoo-ops-mp-hall-registry */
export function mpHallRegistryGatewayPlugin(): Plugin {
  return {
    name: 'mp-hall-registry-gateway',
    configResolved(config) {
      applyViteEnvToProcess(loadEnv(config.mode, config.root, ''))
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? ''
        const path = rawUrl.split('?')[0]
        if (path !== '/api/meoo-ops-mp-hall-registry') return next()

        const method = req.method ?? 'GET'
        if (method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
          res.end()
          return
        }

        const mockReq = {
          method,
          url: rawUrl,
          query: Object.fromEntries(new URL(rawUrl, 'http://127.0.0.1').searchParams),
          headers: req.headers,
        } as unknown as VercelRequest

        const { mockRes, setStatus } = createMockVercelResponse(res)

        try {
          await mpHallRegistryHandler(mockReq, mockRes)
        } catch (e) {
          setStatus(500)
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              ok: false,
              error: 'mp_hall_registry_gateway_failed',
              detail: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })
    },
  }
}
