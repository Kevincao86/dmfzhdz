/**
 * POST /api/meoo-kb — 知识库 list/upload/update/delete/search/reparse
 * body.action 区分操作；scope=ops_global|tenant
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  deleteKbDocument,
  KB_MAX_UPLOAD_BYTES,
  listKbDocuments,
  reparseKbDocument,
  searchKbChunks,
  updateKbDocument,
  uploadKbDocument,
  type KbScope,
  type KbVisibility,
} from '../vite-plugins/knowledgeBaseCore.js'
import { readRegistryPgConnectionString } from '../src/lib/registrySnapshotPgAppend.js'

export const config = { maxDuration: 120 }

function sendJson(res: VercelResponse, status: number, body: Record<string, unknown>): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(status).send(JSON.stringify(body))
}

function rawBody(req: VercelRequest): string {
  try {
    if (typeof req.body === 'string') return req.body
    if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
    if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)
    return ''
  } catch {
    return ''
  }
}

function bearer(authHeader: string | undefined): string | undefined {
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : undefined
}

function asScope(raw: unknown): KbScope | null {
  const s = String(raw || '').trim()
  if (s === 'ops_global' || s === 'tenant') return s
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.status(204).end()
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
      return
    }
    if (!readRegistryPgConnectionString()) {
      sendJson(res, 503, { ok: false, error: 'postgres_not_configured' })
      return
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody(req) || '{}') as Record<string, unknown>
    } catch {
      sendJson(res, 400, { ok: false, error: 'invalid_json' })
      return
    }

    const action = String(body.action || '').trim()
    const scope = asScope(body.scope)
    if (!scope) {
      sendJson(res, 400, { ok: false, error: 'invalid_scope' })
      return
    }

    const env = process.env as Record<string, string>
    let tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
    let uploadedBy = typeof body.uploadedBy === 'string' ? body.uploadedBy.trim() : ''

    if (scope === 'tenant') {
      const token = bearer(req.headers.authorization)
      if (!token) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      let user: Awaited<ReturnType<typeof verifyBearerJwt>>
      try {
        user = await verifyBearerJwt(`Bearer ${token}`, env)
      } catch (e) {
        sendJson(res, 401, {
          ok: false,
          error: 'unauthorized',
          detail: e instanceof Error ? e.message : String(e),
        })
        return
      }
      if (!user) {
        sendJson(res, 401, { ok: false, error: 'unauthorized' })
        return
      }
      const ctx = await loadTenantAiContextForUser(user.id, env, token, tenantId || undefined)
      if (!ctx?.tenantId) {
        sendJson(res, 403, { ok: false, error: 'tenant_not_found' })
        return
      }
      if (tenantId && tenantId !== ctx.tenantId) {
        sendJson(res, 403, { ok: false, error: 'tenant_mismatch' })
        return
      }
      tenantId = ctx.tenantId
      uploadedBy = uploadedBy || user.id
    } else {
      uploadedBy = uploadedBy || 'ops'
    }

    if (action === 'list') {
      const documents = await listKbDocuments({ scope, tenantId })
      sendJson(res, 200, { ok: true, documents })
      return
    }

    if (action === 'upload') {
      const doc = await uploadKbDocument({
        scope,
        tenantId,
        title: typeof body.title === 'string' ? body.title : undefined,
        fileName: String(body.fileName || 'note.txt'),
        contentType: String(body.contentType || 'text/plain'),
        contentBase64: typeof body.contentBase64 === 'string' ? body.contentBase64 : undefined,
        plainText: typeof body.plainText === 'string' ? body.plainText : undefined,
        summary: typeof body.summary === 'string' ? body.summary : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        visibility: body.visibility as KbVisibility | undefined,
        feedEnabled: body.feedEnabled !== false,
        uploadedBy,
      })
      sendJson(res, 200, { ok: true, document: doc, maxBytes: KB_MAX_UPLOAD_BYTES })
      return
    }

    if (action === 'update') {
      const doc = await updateKbDocument({
        documentId: String(body.documentId || ''),
        scope,
        tenantId,
        title: typeof body.title === 'string' ? body.title : undefined,
        summary: typeof body.summary === 'string' ? body.summary : undefined,
        tags: Array.isArray(body.tags) ? body.tags.map(String) : undefined,
        visibility: body.visibility as KbVisibility | undefined,
        feedEnabled: typeof body.feedEnabled === 'boolean' ? body.feedEnabled : undefined,
        reparseWithSummary: body.reparseWithSummary === true,
      })
      sendJson(res, 200, { ok: true, document: doc })
      return
    }

    if (action === 'delete') {
      await deleteKbDocument({
        documentId: String(body.documentId || ''),
        scope,
        tenantId,
      })
      sendJson(res, 200, { ok: true })
      return
    }

    if (action === 'reparse') {
      const doc = await reparseKbDocument({
        documentId: String(body.documentId || ''),
        scope,
        tenantId,
        summary: typeof body.summary === 'string' ? body.summary : undefined,
      })
      sendJson(res, 200, { ok: true, document: doc })
      return
    }

    if (action === 'search') {
      const hits = await searchKbChunks({
        query: String(body.query || ''),
        mode: scope === 'ops_global' ? 'ops' : 'tenant',
        tenantId,
        topK: typeof body.topK === 'number' ? body.topK : 5,
      })
      sendJson(res, 200, { ok: true, hits })
      return
    }

    sendJson(res, 400, { ok: false, error: 'invalid_action' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const known = new Set([
      'tenant_id_required',
      'missing_content',
      'invalid_size',
      'not_found',
      'document_id_required',
      'postgres_not_configured',
    ])
    sendJson(res, known.has(msg) ? 400 : 500, {
      ok: false,
      error: known.has(msg) ? msg : 'kb_error',
      detail: msg.slice(0, 400),
    })
  }
}
