import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * dev：把 `/api/provision-tenant` 转发到 Supabase Edge Function，密钥仅存于本机 Node（勿用 VITE_ 暴露给浏览器）。
 */
export function provisionTenantProxyPlugin(): Plugin {
  return {
    name: 'meoo-provision-tenant-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/api/provision-tenant' || req.method !== 'POST') return next()

        const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
        const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
        const secret = process.env.MEOO_PROVISION_SECRET

        if (!supabaseUrl?.trim() || !anon?.trim() || !secret?.trim()) {
          json(res, 503, {
            ok: false,
            error: 'provision_not_configured',
            hint: '在商家管理后台 .env.local 配置 VITE_SUPABASE_URL、SUPABASE_ANON_KEY、MEOO_PROVISION_SECRET，并部署 Edge Function provision-tenant',
          })
          return
        }

        try {
          const body = await readBody(req)
          const fnUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/provision-tenant`
          const upstream = await fetch(fnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${anon}`,
              apikey: anon,
              'x-meoo-provision-secret': secret,
            },
            body,
          })
          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(text)
        } catch (e) {
          json(res, 502, {
            ok: false,
            error: 'provision_upstream_failed',
            detail: e instanceof Error ? e.message : String(e),
          })
        }
      })
    },
  }
}
