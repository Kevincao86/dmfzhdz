/** 运营台知识库 API */
import { opsErpApiUrl } from '../lib/opsErpApiBase'
import { readOpsSession } from './opsStaffAuth'
import type { KbDocument, KbVisibility } from '../meooRegistryShared/knowledgeBaseTypes'

export type { KbDocument, KbVisibility }

async function postKb(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const session = readOpsSession()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (session?.sessionToken) headers.Authorization = `Bearer ${session.sessionToken}`
  const url = opsErpApiUrl('/api/meoo-kb')
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...body,
      scope: 'ops_global',
      uploadedBy: session?.phone || session?.displayName || 'ops',
    }),
  })
  const text = await res.text()
  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(`非 JSON（HTTP ${res.status}）`)
  }
  if (!res.ok || json.ok === false) {
    throw new Error(String(json.detail || json.error || `HTTP ${res.status}`))
  }
  return json
}

export async function listOpsKbDocuments(): Promise<KbDocument[]> {
  const r = await postKb({ action: 'list' })
  return Array.isArray(r.documents) ? (r.documents as KbDocument[]) : []
}

export async function uploadOpsKbDocument(params: {
  title?: string
  fileName: string
  contentType: string
  contentBase64?: string
  plainText?: string
  summary?: string
  tags?: string[]
  visibility?: KbVisibility
  feedEnabled?: boolean
}): Promise<KbDocument> {
  const r = await postKb({
    action: 'upload',
    ...params,
    visibility: params.visibility || 'ops_only',
  })
  return r.document as KbDocument
}

export async function updateOpsKbDocument(params: {
  documentId: string
  title?: string
  summary?: string
  visibility?: KbVisibility
  feedEnabled?: boolean
  reparseWithSummary?: boolean
}): Promise<KbDocument> {
  const r = await postKb({ action: 'update', ...params })
  return r.document as KbDocument
}

export async function deleteOpsKbDocument(documentId: string): Promise<void> {
  await postKb({ action: 'delete', documentId })
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
