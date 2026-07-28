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

function fileKey(f: File): string {
  return `${f.webkitRelativePath || f.name}::${f.size}::${f.lastModified}`
}

/** 合并待传文件，按路径/大小/时间去重 */
export function mergeUniqueFiles(prev: File[], next: File[]): File[] {
  const map = new Map<string, File>()
  for (const f of prev) map.set(fileKey(f), f)
  for (const f of next) {
    if (!f || f.size < 0) continue
    // 跳过空目录占位（部分浏览器会给出 size=0 且无扩展名的目录项）
    if (f.size === 0 && !f.name.includes('.') && !f.type) continue
    map.set(fileKey(f), f)
  }
  return Array.from(map.values())
}

function readDirEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(all)
            return
          }
          all.push(...batch)
          readBatch()
        },
        reject,
      )
    }
    readBatch()
  })
}

async function entryToFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
    // 保留相对路径，便于文件夹上传后标题可读
    const path = entry.fullPath?.replace(/^\//, '') || file.name
    if (path && path !== file.name) {
      try {
        Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
      } catch {
        /* ignore */
      }
    }
    return [file]
  }
  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry
    const children = await readDirEntries(dir.createReader())
    const nested = await Promise.all(children.map((c) => entryToFiles(c)))
    return nested.flat()
  }
  return []
}

/** 从拖放事件收集文件（支持文件夹递归） */
export async function collectFilesFromDataTransfer(dt: DataTransfer | null): Promise<File[]> {
  if (!dt) return []
  const items = dt.items
  if (items && items.length) {
    const entries: FileSystemEntry[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind !== 'file') continue
      const entry =
        typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null
      if (entry) entries.push(entry)
    }
    if (entries.length) {
      const nested = await Promise.all(entries.map((e) => entryToFiles(e)))
      return nested.flat()
    }
  }
  return Array.from(dt.files || [])
}
