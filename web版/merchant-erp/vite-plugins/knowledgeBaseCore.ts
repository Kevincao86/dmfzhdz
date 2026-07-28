/**
 * 知识库核心：Postgres 元数据/切片 + 关键词检索 + 文本解析切块。
 * 原文件走 OSS（uploadMerchantProductImage）；不写 ops_registry_snapshot。
 */
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { readRegistryPgConnectionString } from '../src/lib/registrySnapshotPgAppend.js'
import { uploadMerchantProductImage } from './merchantProductImageStorage.js'

const { Client } = pg

export type KbScope = 'ops_global' | 'tenant'
export type KbFileType = 'pdf' | 'docx' | 'pptx' | 'md' | 'txt' | 'image' | 'video' | 'other'
export type KbParseStatus = 'pending' | 'ready' | 'failed' | 'manual'
export type KbVisibility = 'ops_only' | 'tenant_agents' | 'all_agents'

export type KbDocumentRow = {
  id: string
  space_id: string
  title: string
  file_type: KbFileType
  file_name: string
  content_type: string
  oss_url: string
  object_path: string
  size_bytes: number
  parse_status: KbParseStatus
  parse_error: string | null
  summary: string
  tags: string[]
  visibility: KbVisibility
  feed_enabled: boolean
  uploaded_by: string
  created_at: string
  updated_at: string
  scope?: KbScope
  tenant_id?: string | null
}

export type KbChunkHit = {
  chunk_id: string
  document_id: string
  chunk_index: number
  content: string
  title: string
  file_name: string
  scope: KbScope
  tenant_id: string | null
  score: number
}

const CHUNK_SIZE = 800
const CHUNK_OVERLAP = 80
export const KB_MAX_UPLOAD_BYTES = 40 * 1024 * 1024

function requirePgCs(): string {
  const cs = readRegistryPgConnectionString()
  if (!cs) throw new Error('postgres_not_configured')
  return cs
}

async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: requirePgCs() })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => {})
  }
}

export function detectKbFileType(fileName: string, contentType: string): KbFileType {
  const n = fileName.toLowerCase()
  const ct = contentType.toLowerCase()
  if (n.endsWith('.pdf') || ct.includes('pdf')) return 'pdf'
  if (n.endsWith('.docx') || ct.includes('wordprocessingml')) return 'docx'
  if (n.endsWith('.pptx') || ct.includes('presentationml')) return 'pptx'
  if (n.endsWith('.md') || n.endsWith('.markdown') || ct.includes('markdown')) return 'md'
  if (n.endsWith('.txt') || ct.startsWith('text/plain')) return 'txt'
  if (/^image\//.test(ct) || /\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'image'
  if (/^video\//.test(ct) || /\.(mp4|webm|mov|m4v)$/.test(n)) return 'video'
  return 'other'
}

function normalizeVisibility(raw: unknown, scope: KbScope): KbVisibility {
  const v = String(raw || '').trim()
  if (v === 'ops_only' || v === 'tenant_agents' || v === 'all_agents') return v
  return scope === 'ops_global' ? 'ops_only' : 'tenant_agents'
}

function chunkText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim()
  if (!cleaned) return []
  if (cleaned.length <= CHUNK_SIZE) return [cleaned]
  const out: string[] = []
  let i = 0
  while (i < cleaned.length) {
    const end = Math.min(cleaned.length, i + CHUNK_SIZE)
    out.push(cleaned.slice(i, end))
    if (end >= cleaned.length) break
    i = Math.max(0, end - CHUNK_OVERLAP)
  }
  return out.slice(0, 200)
}

/** 从二进制中粗提可读文本（无第三方 PDF/Office 依赖时的兜底） */
function extractPrintableRuns(buf: Buffer): string {
  const s = buf.toString('utf8', 0, Math.min(buf.length, 2_000_000))
  const runs = s.match(/[\u4e00-\u9fffA-Za-z0-9，。！？、；：""''（）【】\s.,!?;:'"()\-]{12,}/g)
  if (!runs?.length) return ''
  return runs.join('\n').replace(/\s+/g, ' ').trim().slice(0, 80_000)
}

export function extractKbText(params: {
  fileType: KbFileType
  buf: Buffer
  summary?: string
}): { text: string; status: KbParseStatus; error?: string } {
  const summary = String(params.summary || '').trim()
  const { fileType, buf } = params

  if (fileType === 'txt' || fileType === 'md') {
    const text = buf.toString('utf8').replace(/\u0000/g, '').trim()
    const merged = [summary, text].filter(Boolean).join('\n\n')
    if (!merged) return { text: '', status: 'failed', error: 'empty_text' }
    return { text: merged, status: 'ready' }
  }

  if (fileType === 'image' || fileType === 'video') {
    if (!summary) {
      return {
        text: '',
        status: 'manual',
        error: 'image_video_need_summary',
      }
    }
    return { text: summary, status: 'ready' }
  }

  const crude = extractPrintableRuns(buf)
  const merged = [summary, crude].filter(Boolean).join('\n\n').trim()
  if (merged.length >= 40) {
    return { text: merged, status: summary && !crude ? 'manual' : 'ready' }
  }
  if (summary) return { text: summary, status: 'manual' }
  return {
    text: '',
    status: 'failed',
    error: 'parse_failed_need_summary',
  }
}

export async function ensureKbSpace(scope: KbScope, tenantId?: string | null): Promise<string> {
  return withClient(async (c) => {
    if (scope === 'ops_global') {
      const found = await c.query<{ id: string }>(
        `select id from public.kb_spaces
         where scope = 'ops_global' and status = 'active'
         order by created_at asc limit 1`,
      )
      if (found.rows[0]?.id) return found.rows[0].id
      const id = randomUUID()
      await c.query(
        `insert into public.kb_spaces (id, scope, tenant_id, title, status)
         values ($1, 'ops_global', null, '运营全局知识库', 'active')`,
        [id],
      )
      return id
    }
    const tid = String(tenantId || '').trim()
    if (!tid) throw new Error('tenant_id_required')
    const found = await c.query<{ id: string }>(
      `select id from public.kb_spaces
       where scope = 'tenant' and tenant_id = $1::uuid and status = 'active'
       order by created_at asc limit 1`,
      [tid],
    )
    if (found.rows[0]?.id) return found.rows[0].id
    const id = randomUUID()
    await c.query(
      `insert into public.kb_spaces (id, scope, tenant_id, title, status)
       values ($1, 'tenant', $2::uuid, '租户知识库', 'active')`,
      [id, tid],
    )
    return id
  })
}

async function replaceChunks(
  client: pg.Client,
  documentId: string,
  chunks: string[],
  meta: Record<string, unknown> = {},
): Promise<void> {
  await client.query(`delete from public.kb_chunks where document_id = $1::uuid`, [documentId])
  for (let i = 0; i < chunks.length; i++) {
    await client.query(
      `insert into public.kb_chunks (id, document_id, chunk_index, content, meta)
       values ($1::uuid, $2::uuid, $3, $4, $5::jsonb)`,
      [randomUUID(), documentId, i, chunks[i], JSON.stringify(meta)],
    )
  }
}

function mapDoc(row: Record<string, unknown>): KbDocumentRow {
  return {
    id: String(row.id),
    space_id: String(row.space_id),
    title: String(row.title || ''),
    file_type: row.file_type as KbFileType,
    file_name: String(row.file_name || ''),
    content_type: String(row.content_type || ''),
    oss_url: String(row.oss_url || ''),
    object_path: String(row.object_path || ''),
    size_bytes: Number(row.size_bytes) || 0,
    parse_status: row.parse_status as KbParseStatus,
    parse_error: row.parse_error == null ? null : String(row.parse_error),
    summary: String(row.summary || ''),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    visibility: row.visibility as KbVisibility,
    feed_enabled: row.feed_enabled !== false,
    uploaded_by: String(row.uploaded_by || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
    scope: row.scope as KbScope | undefined,
    tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
  }
}

export async function listKbDocuments(params: {
  scope: KbScope
  tenantId?: string | null
}): Promise<KbDocumentRow[]> {
  const spaceId = await ensureKbSpace(params.scope, params.tenantId)
  return withClient(async (c) => {
    const r = await c.query(
      `select d.*, s.scope, s.tenant_id
       from public.kb_documents d
       join public.kb_spaces s on s.id = d.space_id
       where d.space_id = $1::uuid
       order by d.created_at desc
       limit 500`,
      [spaceId],
    )
    return r.rows.map((row) => mapDoc(row as Record<string, unknown>))
  })
}

export async function uploadKbDocument(params: {
  scope: KbScope
  tenantId?: string | null
  title?: string
  fileName: string
  contentType: string
  contentBase64?: string
  plainText?: string
  summary?: string
  tags?: string[]
  visibility?: KbVisibility
  feedEnabled?: boolean
  uploadedBy?: string
}): Promise<KbDocumentRow> {
  const scope = params.scope
  const tenantId = scope === 'tenant' ? String(params.tenantId || '').trim() : null
  if (scope === 'tenant' && !tenantId) throw new Error('tenant_id_required')

  const fileName = String(params.fileName || 'note.txt').trim() || 'note.txt'
  const contentType = String(params.contentType || 'text/plain').trim() || 'text/plain'
  const plainText = String(params.plainText || '').trim()
  const summary = String(params.summary || '').trim()
  let buf: Buffer
  if (plainText) {
    buf = Buffer.from(plainText, 'utf8')
  } else if (params.contentBase64) {
    buf = Buffer.from(String(params.contentBase64), 'base64')
  } else {
    throw new Error('missing_content')
  }
  if (!buf.length || buf.length > KB_MAX_UPLOAD_BYTES) throw new Error('invalid_size')

  const fileType = detectKbFileType(fileName, contentType)
  const spaceId = await ensureKbSpace(scope, tenantId)
  const merchantId =
    scope === 'ops_global' ? 'kb/global' : `kb/tenant/${tenantId}`
  const uploaded = await uploadMerchantProductImage({
    merchantId,
    buf,
    safeMime: contentType.slice(0, 120) || 'application/octet-stream',
    originalName: fileName,
  })

  const extracted = extractKbText({ fileType, buf, summary })
  const chunks = chunkText(extracted.text)
  const docId = randomUUID()
  const title = String(params.title || fileName).trim() || fileName
  const visibility = normalizeVisibility(params.visibility, scope)
  const tags = Array.isArray(params.tags) ? params.tags.map(String).filter(Boolean).slice(0, 30) : []
  const feedEnabled = params.feedEnabled !== false
  const uploadedBy = String(params.uploadedBy || '').trim()

  return withClient(async (c) => {
    await c.query(
      `insert into public.kb_documents (
         id, space_id, title, file_type, file_name, content_type,
         oss_url, object_path, size_bytes, parse_status, parse_error, summary,
         tags, visibility, feed_enabled, uploaded_by
       ) values (
         $1::uuid, $2::uuid, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13::text[], $14, $15, $16
       )`,
      [
        docId,
        spaceId,
        title,
        fileType,
        fileName,
        contentType,
        uploaded.publicUrl,
        uploaded.objectPath,
        buf.length,
        chunks.length ? extracted.status : 'failed',
        chunks.length ? extracted.error || null : extracted.error || 'empty_chunks',
        summary,
        tags,
        visibility,
        feedEnabled,
        uploadedBy,
      ],
    )
    if (chunks.length) {
      await replaceChunks(c, docId, chunks, { source: 'upload' })
    }
    const r = await c.query(
      `select d.*, s.scope, s.tenant_id
       from public.kb_documents d
       join public.kb_spaces s on s.id = d.space_id
       where d.id = $1::uuid`,
      [docId],
    )
    return mapDoc(r.rows[0] as Record<string, unknown>)
  })
}

export async function updateKbDocument(params: {
  documentId: string
  scope: KbScope
  tenantId?: string | null
  title?: string
  summary?: string
  tags?: string[]
  visibility?: KbVisibility
  feedEnabled?: boolean
  reparseWithSummary?: boolean
}): Promise<KbDocumentRow> {
  const docId = String(params.documentId || '').trim()
  if (!docId) throw new Error('document_id_required')
  const spaceId = await ensureKbSpace(params.scope, params.tenantId)

  return withClient(async (c) => {
    const cur = await c.query(
      `select * from public.kb_documents where id = $1::uuid and space_id = $2::uuid`,
      [docId, spaceId],
    )
    if (!cur.rows[0]) throw new Error('not_found')
    const row = cur.rows[0] as Record<string, unknown>
    const title = params.title != null ? String(params.title).trim() || String(row.title) : String(row.title)
    const summary =
      params.summary != null ? String(params.summary).trim() : String(row.summary || '')
    const tags =
      params.tags != null
        ? params.tags.map(String).filter(Boolean).slice(0, 30)
        : Array.isArray(row.tags)
          ? (row.tags as string[])
          : []
    const visibility =
      params.visibility != null
        ? normalizeVisibility(params.visibility, params.scope)
        : (row.visibility as KbVisibility)
    const feedEnabled =
      params.feedEnabled != null ? params.feedEnabled !== false : row.feed_enabled !== false

    let parseStatus = row.parse_status as KbParseStatus
    let parseError = row.parse_error == null ? null : String(row.parse_error)

    if (params.reparseWithSummary && summary) {
      const chunks = chunkText(summary)
      await replaceChunks(c, docId, chunks, { source: 'manual_summary' })
      parseStatus = chunks.length ? 'ready' : 'failed'
      parseError = chunks.length ? null : 'empty_chunks'
    }

    await c.query(
      `update public.kb_documents set
         title = $3, summary = $4, tags = $5::text[], visibility = $6,
         feed_enabled = $7, parse_status = $8, parse_error = $9, updated_at = now()
       where id = $1::uuid and space_id = $2::uuid`,
      [docId, spaceId, title, summary, tags, visibility, feedEnabled, parseStatus, parseError],
    )

    const r = await c.query(
      `select d.*, s.scope, s.tenant_id
       from public.kb_documents d
       join public.kb_spaces s on s.id = d.space_id
       where d.id = $1::uuid`,
      [docId],
    )
    return mapDoc(r.rows[0] as Record<string, unknown>)
  })
}

export async function deleteKbDocument(params: {
  documentId: string
  scope: KbScope
  tenantId?: string | null
}): Promise<void> {
  const docId = String(params.documentId || '').trim()
  if (!docId) throw new Error('document_id_required')
  const spaceId = await ensureKbSpace(params.scope, params.tenantId)
  await withClient(async (c) => {
    const r = await c.query(
      `delete from public.kb_documents where id = $1::uuid and space_id = $2::uuid returning id`,
      [docId, spaceId],
    )
    if (!r.rowCount) throw new Error('not_found')
  })
}

export async function reparseKbDocument(params: {
  documentId: string
  scope: KbScope
  tenantId?: string | null
  summary?: string
}): Promise<KbDocumentRow> {
  return updateKbDocument({
    documentId: params.documentId,
    scope: params.scope,
    tenantId: params.tenantId,
    summary: params.summary,
    reparseWithSummary: true,
  })
}

function tokenizeQuery(q: string): string[] {
  return q
    .split(/[\s,，。！？、；：]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 12)
}

/**
 * 检索：运营会话可搜全局；商家/FWS 搜「本租户 ∪ 已下发全局」。
 */
export async function searchKbChunks(params: {
  query: string
  mode: 'ops' | 'tenant'
  tenantId?: string | null
  topK?: number
}): Promise<KbChunkHit[]> {
  const query = String(params.query || '').trim()
  if (!query) return []
  const topK = Math.min(10, Math.max(1, params.topK ?? 5))
  const tokens = tokenizeQuery(query)
  const likeTerms = tokens.length ? tokens : [query.slice(0, 40)]

  return withClient(async (c) => {
    const likeClauses: string[] = []
    const values: unknown[] = []
    likeTerms.forEach((term) => {
      values.push(`%${term}%`)
      likeClauses.push(`c.content ilike $${values.length}`)
    })
    const likeSql = likeClauses.join(' or ')

    let scopeSql = ''
    if (params.mode === 'ops') {
      scopeSql = `s.scope = 'ops_global'`
    } else {
      const tid = String(params.tenantId || '').trim()
      if (!tid) return []
      values.push(tid)
      const tidIdx = values.length
      scopeSql = `(
        (s.scope = 'tenant' and s.tenant_id = $${tidIdx}::uuid)
        or (
          s.scope = 'ops_global'
          and d.visibility in ('tenant_agents', 'all_agents')
        )
      )`
    }

    const sql = `
      select
        c.id as chunk_id,
        c.document_id,
        c.chunk_index,
        c.content,
        d.title,
        d.file_name,
        s.scope,
        s.tenant_id
      from public.kb_chunks c
      join public.kb_documents d on d.id = c.document_id
      join public.kb_spaces s on s.id = d.space_id
      where d.feed_enabled = true
        and d.parse_status in ('ready', 'manual')
        and (${scopeSql})
        and (${likeSql})
      order by c.chunk_index asc
      limit 80
    `
    const r = await c.query(sql, values)
    const scored = r.rows.map((row) => {
      const content = String(row.content || '')
      let score = 0
      const lower = content.toLowerCase()
      const qLower = query.toLowerCase()
      if (lower.includes(qLower)) score += 10
      for (const t of likeTerms) {
        if (lower.includes(t.toLowerCase())) score += 3
      }
      return {
        chunk_id: String(row.chunk_id),
        document_id: String(row.document_id),
        chunk_index: Number(row.chunk_index) || 0,
        content,
        title: String(row.title || ''),
        file_name: String(row.file_name || ''),
        scope: row.scope as KbScope,
        tenant_id: row.tenant_id == null ? null : String(row.tenant_id),
        score,
      } satisfies KbChunkHit
    })
    scored.sort((a, b) => b.score - a.score || a.chunk_index - b.chunk_index)
    return scored.slice(0, topK)
  })
}

/** 拼入 AI system 的知识库上下文（限字数） */
export function formatKbHitsForPrompt(hits: KbChunkHit[], maxChars = 3500): string {
  if (!hits.length) return ''
  const lines: string[] = ['【知识库片段】以下资料供回答参考，请优先依据，并在必要时标注出处：']
  let used = lines[0]!.length
  for (const h of hits) {
    const cite = `来源: ${h.title || h.file_name}#${h.chunk_index}`
    const body = h.content.slice(0, 700)
    const block = `\n---\n${cite}\n${body}`
    if (used + block.length > maxChars) break
    lines.push(block)
    used += block.length
  }
  return lines.join('')
}
