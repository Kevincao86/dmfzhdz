/**
 * 火山方舟 Seedance / 视频生成 content 数组构造（图生须带 role）。
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

function normalizeImageUrl(row: string): string {
  let url = row.trim()
  if (!url.startsWith('data:image') && /^[a-z0-9+/=\s]+$/i.test(url.replace(/\s/g, ''))) {
    url = `data:image/jpeg;base64,${url.replace(/\s/g, '')}`
  }
  return url
}

/** 为 i2v 参考图分配 role（首帧 / 首尾帧 / 参考图三种场景互斥，禁止混用） */
export function seedanceImageRoleForIndex(_index: number, total: number): SeedanceImageRole {
  // 单图：首帧图生视频
  if (total <= 1) return 'first_frame'
  // 多图：一律走「参考图」模式（即梦式人物+场景双参考）。
  // 若首张标 first_frame、其余 reference_image，方舟会报：
  // first/last frame content cannot be mixed with reference media content
  return 'reference_image'
}

export function buildSeedanceImageContentItems(imageRows: string[]): Record<string, unknown>[] {
  const rows = imageRows.map((r) => r.trim()).filter(Boolean)
  return rows.map((row, i) => {
    const item: Record<string, unknown> = {
      type: 'image_url',
      image_url: { url: normalizeImageUrl(row) },
      role: seedanceImageRoleForIndex(i, rows.length),
    }
    return item
  })
}

/** 若 content 已有 image_url 但缺 role，补齐（避免预构建 content 漏 role） */
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
  return content.map((row, i) => {
    if (String(row.type) !== 'image_url') return row
    if (row.role && String(row.role).trim()) return row
    const pos = imageIdx.indexOf(i)
    const role = seedanceImageRoleForIndex(pos >= 0 ? pos : 0, imageIdx.length)
    return { ...row, role }
  })
}
