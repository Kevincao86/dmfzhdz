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

function fileKey(f: File): string {
  return `${f.webkitRelativePath || f.name}::${f.size}::${f.lastModified}`
}

/** 合并待传文件，按路径/大小/时间去重 */
export function mergeUniqueFiles(prev: File[], next: File[]): File[] {
  const map = new Map<string, File>()
  for (const f of prev) map.set(fileKey(f), f)
  for (const f of next) {
    if (!f || f.size < 0) continue
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
