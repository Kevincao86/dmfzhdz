/** IMS 智能一键成片 — 前端/服务端共用的素材与分镜抽取 */

export type IceSmartBatchMaterial = {
  kind: 'video' | 'image'
  mediaUrl: string
  label?: string
}

export type IceSmartBatchScriptRow = {
  timeRange?: string
  visual?: string
  dialogue?: string
}

function pickSmartBatchSegmentCount(
  scriptRows: IceSmartBatchScriptRow[],
  materialCount: number,
  targetTotalSec: number,
): number {
  const rowCount = scriptRows.filter((r) => String(r.dialogue ?? '').trim().length >= 2).length
  if (rowCount >= 2) return Math.min(rowCount, materialCount)
  return Math.max(2, Math.min(materialCount, Math.ceil(targetTotalSec / 5)))
}

/** AI 规划后：按叙事顺序抽取 K 条素材，供 IMS 脚本化自动成片（全局口播 + 平均分配时长） */
export function buildSmartBatchSubmitPayload(input: {
  materials: IceSmartBatchMaterial[]
  scriptRows: IceSmartBatchScriptRow[]
  materialSlots?: number[]
  targetTotalSec: number
}): {
  materials: IceSmartBatchMaterial[]
  materialSlots: number[]
  scriptRows: IceSmartBatchScriptRow[]
  segmentCount: number
} {
  const segmentCount = pickSmartBatchSegmentCount(
    input.scriptRows,
    input.materials.length,
    input.targetTotalSec,
  )
  const slots = (input.materialSlots ?? []).filter(
    (n) => Number.isFinite(n) && n >= 0 && n < input.materials.length,
  )
  const ordered: number[] = []
  const seen = new Set<number>()
  for (const mi of slots) {
    if (seen.has(mi)) continue
    seen.add(mi)
    ordered.push(mi)
    if (ordered.length >= segmentCount) break
  }
  if (ordered.length < segmentCount) {
    for (let i = 0; i < input.materials.length && ordered.length < segmentCount; i++) {
      const mi = Math.round((i * (input.materials.length - 1)) / Math.max(1, segmentCount - 1))
      if (!seen.has(mi)) {
        seen.add(mi)
        ordered.push(mi)
      }
    }
  }
  const picked = ordered.slice(0, segmentCount).map((mi) => input.materials[mi]!)
  const rows = input.scriptRows.slice(0, segmentCount)
  while (rows.length < segmentCount && input.scriptRows.length > 0) {
    rows.push(input.scriptRows[rows.length % input.scriptRows.length]!)
  }
  return {
    materials: picked.length >= 2 ? picked : input.materials.slice(0, Math.max(2, segmentCount)),
    materialSlots: picked.map((_, i) => i),
    scriptRows: rows.slice(0, segmentCount),
    segmentCount,
  }
}
