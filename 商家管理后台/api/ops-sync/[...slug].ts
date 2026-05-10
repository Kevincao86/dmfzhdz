/**
 * Vercel：/api/ops-sync/* 注册表（Supabase ops_registry_snapshot），与 ERP 拉取同源。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createOpsServiceRoleClient } from '../lib/createOpsServiceRoleClient'
import { dispatchOpsRegistrySupabase } from '../../src/ops/opsRegistrySupabaseDispatch'

function rawBody(req: VercelRequest): string {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
  return ''
}

function sendCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  sendCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const slug = req.query.slug
  const parts = Array.isArray(slug) ? slug : slug ? [slug] : []
  const urlPath = '/api/ops-sync/' + parts.join('/')

  const method = req.method ?? 'GET'
  const bodyRaw =
    method === 'POST' || method === 'PUT' || method === 'PATCH' ? rawBody(req) : ''

  const client = createOpsServiceRoleClient()
  if (!client.ok) {
    res.status(client.status).json(client.body)
    return
  }

  const out = await dispatchOpsRegistrySupabase({
    method,
    urlPath,
    bodyRaw,
    admin: client.admin,
  })

  const payload =
    typeof out.body === 'string' ? out.body : JSON.stringify(out.body)
  res.status(out.status).setHeader('Content-Type', 'application/json; charset=utf-8').send(payload)
}
