/**
 * 火山方舟 Seedance / 视频生成 content 数组构造（图生须带 role）。
 *
 * 注意：多张 `reference_image` 会被方舟推断为 task_type=r2v；
 * Seedance 1.0 / 1.5 不支持 r2v，仅 Seedance 2.0 支持。对 1.x 必须压成单图 first_frame（i2v）。
 */
import { isArkVideoEndpointId, isDoubaoSeedanceModelId, normalizeArkVideoModelParam } from './arkVideoEndpointsConfig.js'
import { isArkGenerativeVideoModelId } from './arkModelCatalog.js'

export type SeedanceImageRole = 'first_frame' | 'last_frame' | 'reference_image'

/** 该 model 走 v2 content API，图片项必须带 role */
export function seedanceContentRequiresImageRole(modelId: string): boolean {
  const norm = normalizeArkVideoModelParam(modelId).toLowerCase()
  if (isArkVideoEndpointId(norm)) return false
  if (isDoubaoSeedanceModelId(norm)) return true
  if (/seaweed|wan2-1-14b|wan2\.1-14b/.test(norm)) return true
  return isArkGenerativeVideoModelId(norm)
}

/** Seedance 2.0 才支持多参考图 r2v；1.0/1.5 仅 i2v 首帧 */
export function seedanceModelSupportsReferenceR2v(modelId: string): boolean {
  const m = normalizeArkVideoModelParam(modelId).toLowerCase()
  return /seedance-2-0|seedance-2\.0/.test(m)
}

function normalizeImageUrl(row: string): string {
  let url = row.trim()
  if (!url.startsWith('data:image') && /^[a-z0-9+/=\s]+$/i.test(url.replace(/\s/g, ''))) {
    url = `data:image/jpeg;base64,${url.replace(/\s/g, '')}`
  }
  return url
}

/**
 * 按模型能力压图：非 r2v 模型多图会触发方舟 task_type=r2v 报错，只保留首张走 i2v。
 */
export function clampSeedanceImagesForModel(modelId: string, imageRows: string[]): string[] {
  const rows = imageRows.map((r) => r.trim()).filter(Boolean)
  if (rows.length <= 1) return rows
  if (seedanceModelSupportsReferenceR2v(modelId)) return rows
  return rows.slice(0, 1)
}

/** 为 i2v / r2v 参考图分配 role（首帧与参考图互斥，禁止混用） */
export function seedanceImageRoleForIndex(
  _index: number,
  total: number,
  modelId?: string,
): SeedanceImageRole {
  if (total <= 1) return 'first_frame'
  if (modelId && seedanceModelSupportsReferenceR2v(modelId)) return 'reference_image'
  // 非 2.0：调用方应先 clamp；兜底仍标 first_frame，避免误发 r2v
  return 'first_frame'
}

export function buildSeedanceImageContentItems(
  imageRows: string[],
  modelId = '',
): Record<string, unknown>[] {
  const rows = clampSeedanceImagesForModel(modelId, imageRows)
  return rows.map((row, i) => {
    const item: Record<string, unknown> = {
      type: 'image_url',
      image_url: { url: normalizeImageUrl(row) },
      role: seedanceImageRoleForIndex(i, rows.length, modelId),
    }
    return item
  })
}

/** 若 content 已有 image_url 但缺 role，补齐；非 r2v 模型多图压成首帧单图 */
export function ensureSeedanceContentImageRoles(
  content: Record<string, unknown>[],
  modelId: string,
): Record<string, unknown>[] {
  if (!seedanceContentRequiresImageRole(modelId)) return content
  const imageIdx: number[] = []
  for (let i = 0; i < content.length; i++) {
    if (String(content[i]?.type) === 'image_url') imageIdx.push(i)
  }
  if (!imageIdx.length) return content

  const keepOnlyFirst = imageIdx.length > 1 && !seedanceModelSupportsReferenceR2v(modelId)
  const keepSet = keepOnlyFirst ? new Set([imageIdx[0]!]) : new Set(imageIdx)
  const effectiveTotal = keepOnlyFirst ? 1 : imageIdx.length

  const out: Record<string, unknown>[] = []
  for (let i = 0; i < content.length; i++) {
    const row = content[i]!
    if (String(row.type) !== 'image_url') {
      out.push(row)
      continue
    }
    if (!keepSet.has(i)) continue
    const pos = keepOnlyFirst ? 0 : imageIdx.indexOf(i)
    const role =
      row.role && String(row.role).trim() && !keepOnlyFirst
        ? String(row.role)
        : seedanceImageRoleForIndex(pos >= 0 ? pos : 0, effectiveTotal, modelId)
    out.push({ ...row, role })
  }
  return out
}
