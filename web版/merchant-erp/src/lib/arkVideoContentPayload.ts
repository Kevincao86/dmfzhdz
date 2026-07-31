/**
 * 火山方舟 Seedance / 视频生成 content 数组构造（图生须带 role）。
 *
 * - 多张 `reference_image` → 方舟 task_type=r2v（仅 Seedance 2.0 支持）
 * - 即梦式首尾帧：`first_frame` + `last_frame`（1.0/1.5/2.0 均支持，非 r2v）
 * - 默认 1.x 多图若未声明首尾帧，压成单图 first_frame，避免误触 r2v
 */
import { isArkVideoEndpointId, isDoubaoSeedanceModelId, normalizeArkVideoModelParam } from './arkVideoEndpointsConfig.js'
import { isArkGenerativeVideoModelId } from './arkModelCatalog.js'

export type SeedanceImageRole = 'first_frame' | 'last_frame' | 'reference_image'

/** 图生布局：first_last=即梦首尾帧；reference=r2v；first_only=单首帧；auto=按模型推断 */
export type SeedanceImageLayoutMode = 'auto' | 'first_last' | 'reference' | 'first_only'

/** 该 model 走 v2 content API，图片项必须带 role */
export function seedanceContentRequiresImageRole(modelId: string): boolean {
  const norm = normalizeArkVideoModelParam(modelId).toLowerCase()
  if (isArkVideoEndpointId(norm)) return false
  if (isDoubaoSeedanceModelId(norm)) return true
  if (/seaweed|wan2-1-14b|wan2\.1-14b/.test(norm)) return true
  return isArkGenerativeVideoModelId(norm)
}

/** Seedance 2.0 才支持多参考图 r2v；1.0/1.5 仅 i2v / 首尾帧 */
export function seedanceModelSupportsReferenceR2v(modelId: string): boolean {
  const m = normalizeArkVideoModelParam(modelId).toLowerCase()
  return /seedance-2-0|seedance-2\.0/.test(m)
}

export function parseSeedanceImageLayoutMode(raw: unknown): SeedanceImageLayoutMode {
  const t = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (t === 'first_last' || t === 'firstlast') return 'first_last'
  if (t === 'reference' || t === 'r2v') return 'reference'
  if (t === 'first_only' || t === 'first' || t === 'i2v') return 'first_only'
  return 'auto'
}

function normalizeImageUrl(row: string): string {
  let url = row.trim()
  if (!url.startsWith('data:image') && /^[a-z0-9+/=\s]+$/i.test(url.replace(/\s/g, ''))) {
    url = `data:image/jpeg;base64,${url.replace(/\s/g, '')}`
  }
  return url
}

function resolveLayoutMode(
  modelId: string,
  imageCount: number,
  mode: SeedanceImageLayoutMode,
): SeedanceImageLayoutMode {
  if (mode !== 'auto') return mode
  if (imageCount <= 1) return 'first_only'
  if (seedanceModelSupportsReferenceR2v(modelId)) return 'reference'
  // 1.x 默认不猜首尾帧，压成单首帧，避免误发 r2v
  return 'first_only'
}

/**
 * 按模型能力与布局模式压图。
 * first_last：最多保留 2 张；reference：2.0 可多图，1.x 仍压成 1；first_only：只留首张。
 */
export function clampSeedanceImagesForModel(
  modelId: string,
  imageRows: string[],
  layoutMode: SeedanceImageLayoutMode = 'auto',
): string[] {
  const rows = imageRows.map((r) => r.trim()).filter(Boolean)
  if (rows.length <= 1) return rows
  const mode = resolveLayoutMode(modelId, rows.length, layoutMode)
  if (mode === 'first_last') return rows.slice(0, 2)
  if (mode === 'reference' && seedanceModelSupportsReferenceR2v(modelId)) return rows
  return rows.slice(0, 1)
}

/** 为 i2v / 首尾帧 / r2v 分配 role（首尾帧与 reference_image 互斥） */
export function seedanceImageRoleForIndex(
  index: number,
  total: number,
  modelId?: string,
  layoutMode: SeedanceImageLayoutMode = 'auto',
): SeedanceImageRole {
  const mode = resolveLayoutMode(modelId ?? '', total, layoutMode)
  if (mode === 'first_last') {
    if (total <= 1) return 'first_frame'
    return index === 0 ? 'first_frame' : 'last_frame'
  }
  if (mode === 'reference') return 'reference_image'
  return 'first_frame'
}

export function buildSeedanceImageContentItems(
  imageRows: string[],
  modelId = '',
  layoutMode: SeedanceImageLayoutMode = 'auto',
): Record<string, unknown>[] {
  const rows = clampSeedanceImagesForModel(modelId, imageRows, layoutMode)
  return rows.map((row, i) => {
    const item: Record<string, unknown> = {
      type: 'image_url',
      image_url: { url: normalizeImageUrl(row) },
      role: seedanceImageRoleForIndex(i, rows.length, modelId, layoutMode),
    }
    return item
  })
}

/** 若 content 已有 image_url 但缺 role，补齐；按布局模式压图 */
export function ensureSeedanceContentImageRoles(
  content: Record<string, unknown>[],
  modelId: string,
  layoutMode: SeedanceImageLayoutMode = 'auto',
): Record<string, unknown>[] {
  if (!seedanceContentRequiresImageRole(modelId)) return content
  const imageIdx: number[] = []
  for (let i = 0; i < content.length; i++) {
    if (String(content[i]?.type) === 'image_url') imageIdx.push(i)
  }
  if (!imageIdx.length) return content

  const mode = resolveLayoutMode(modelId, imageIdx.length, layoutMode)
  const maxKeep = mode === 'first_last' ? 2 : mode === 'reference' && seedanceModelSupportsReferenceR2v(modelId) ? imageIdx.length : 1
  const keepIdx = imageIdx.slice(0, maxKeep)
  const keepSet = new Set(keepIdx)
  const effectiveTotal = keepIdx.length

  const out: Record<string, unknown>[] = []
  for (let i = 0; i < content.length; i++) {
    const row = content[i]!
    if (String(row.type) !== 'image_url') {
      out.push(row)
      continue
    }
    if (!keepSet.has(i)) continue
    const pos = keepIdx.indexOf(i)
    const existingRole = row.role && String(row.role).trim()
    const role =
      existingRole && mode === 'first_last' && (existingRole === 'first_frame' || existingRole === 'last_frame')
        ? existingRole
        : seedanceImageRoleForIndex(pos >= 0 ? pos : 0, effectiveTotal, modelId, mode)
    out.push({ ...row, role })
  }
  return out
}
