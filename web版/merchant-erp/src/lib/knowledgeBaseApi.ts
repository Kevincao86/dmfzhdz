/** 知识库 API 客户端（商家 / 服务商 ERP） */
import { merchantErpApiCandidates } from './merchantErpApiBase'
import { supabase } from './supabaseClient'
import { fetchPrimaryTenantId } from './tenantBilling'

export type KbScope = 'ops_global' | 'tenant'
export type KbVisibility = 'ops_only' | 'tenant_agents' | 'all_agents'
export type KbParseStatus = 'pending' | 'ready' | 'failed' | 'manual'

export type KbDocument = {
  id: string
  title: string
  file_type: string
  file_name: string
  oss_url: string
  size_bytes: number
  parse_status: KbParseStatus
  parse_error: string | null
  summary: string
  tags: string[]
  visibility: KbVisibility
  feed_enabled: boolean
  created_at: string
  updated_at: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const t = data.session?.access_token
    if (t) h.Authorization = `Bearer ${t}`
  }
  return h
}

async function postKb(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = await authHeaders()
  let lastErr = '知识库接口不可用'
  for (const url of merchantErpApiCandidates('/api/meoo-kb')) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
      const text = await res.text()
      let json: Record<string, unknown>
      try {
        json = JSON.parse(text) as Record<string, unknown>
      } catch {
        lastErr = `非 JSON（HTTP ${res.status}）`
        continue
      }
      if (!res.ok || json.ok === false) {
        lastErr = String(json.detail || json.error || `HTTP ${res.status}`)
        continue
      }
      return json
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

export async function resolveKbTenantId(hint?: string): Promise<string> {
  if (hint?.trim()) return hint.trim()
  if (!supabase) throw new Error('未登录')
  const tid = await fetchPrimaryTenantId(supabase)
  if (!tid) throw new Error('未找到租户')
  return tid
}

export async function listTenantKbDocuments(tenantId?: string): Promise<KbDocument[]> {
  const tid = await resolveKbTenantId(tenantId)
  const r = await postKb({ action: 'list', scope: 'tenant', tenantId: tid })
  return Array.isArray(r.documents) ? (r.documents as KbDocument[]) : []
}

export async function uploadTenantKbDocument(params: {
  tenantId?: string
  title?: string
  fileName: string
  contentType: string
  contentBase64?: string
  plainText?: string
  summary?: string
  tags?: string[]
  feedEnabled?: boolean
}): Promise<KbDocument> {
  const tid = await resolveKbTenantId(params.tenantId)
  const r = await postKb({
    action: 'upload',
    scope: 'tenant',
    tenantId: tid,
    title: params.title,
    fileName: params.fileName,
    contentType: params.contentType,
    contentBase64: params.contentBase64,
    plainText: params.plainText,
    summary: params.summary,
    tags: params.tags,
    visibility: 'tenant_agents',
    feedEnabled: params.feedEnabled !== false,
  })
  return r.document as KbDocument
}

export async function updateTenantKbDocument(params: {
  tenantId?: string
  documentId: string
  title?: string
  summary?: string
  feedEnabled?: boolean
  reparseWithSummary?: boolean
}): Promise<KbDocument> {
  const tid = await resolveKbTenantId(params.tenantId)
  const r = await postKb({
    action: 'update',
    scope: 'tenant',
    tenantId: tid,
    documentId: params.documentId,
    title: params.title,
    summary: params.summary,
    feedEnabled: params.feedEnabled,
    reparseWithSummary: params.reparseWithSummary,
  })
  return r.document as KbDocument
}

export async function deleteTenantKbDocument(documentId: string, tenantId?: string): Promise<void> {
  const tid = await resolveKbTenantId(tenantId)
  await postKb({ action: 'delete', scope: 'tenant', tenantId: tid, documentId })
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = String(reader.result || '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    reader.onerror = () => reject(new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}
